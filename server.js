const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const bodyParser = require('body-parser');
const socketIO = require('socket.io');
const { URL } = require('url');

const clientId = uuidv4();
const configPath = path.join(__dirname, 'config.json');

// Cargar configuración
function loadConfig() {
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading config:', error);
        return { comfyUrl: 'http://localhost:8188', isRemote: false };
    }
}

// Guardar configuración
function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

let config = loadConfig();
let wsComfy = null;

// Función para obtener el protocolo HTTP correcto
function getHttpModule(url) {
    return url.startsWith('https') ? https : http;
}

// Función para parsear URL de ComfyUI
function parseComfyUrl(comfyUrl) {
    const url = new URL(comfyUrl);
    return {
        protocol: url.protocol.replace(':', ''),
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '8188'),
        baseUrl: comfyUrl.replace(/\/$/, '') // Remove trailing slash
    };
}

// Función para conectar a ComfyUI WebSocket
function connectToComfyUI() {
    if (wsComfy) {
        try {
            wsComfy.close();
        } catch (e) {
            console.error('Error closing previous WebSocket:', e);
        }
    }

    const parsedUrl = parseComfyUrl(config.comfyUrl);
    const wsProtocol = parsedUrl.protocol === 'https' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${parsedUrl.hostname}:${parsedUrl.port}/ws?clientId=${clientId}`;
    
    console.log(`Connecting to ComfyUI at: ${wsUrl}`);
    broadcastToClients({ type: 'connection_status', status: 'connecting', url: config.comfyUrl });
    
    wsComfy = new WebSocket(wsUrl);
    
    wsComfy.on('open', () => {
        console.log('✓ WebSocket connection established with ComfyUI');
        console.log(`✓ WebSocket ready state: ${wsComfy.readyState}`);
        broadcastToClients({ 
            type: 'connection_status', 
            status: 'connected', 
            url: config.comfyUrl,
            message: 'Conectado exitosamente a ComfyUI'
        });
    });
    
    wsComfy.on('error', (error) => {
        const errorMsg = error.message || 'Error desconocido';
        console.error('✗ WebSocket error:', errorMsg);
        broadcastToClients({ 
            type: 'connection_status', 
            status: 'error', 
            url: config.comfyUrl,
            error: errorMsg,
            message: `Error al conectar a ComfyUI: ${errorMsg}`
        });
    });
    
    wsComfy.on('close', (code, reason) => {
        console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reason || 'No reason'}`);
        broadcastToClients({ 
            type: 'connection_status', 
            status: 'disconnected', 
            url: config.comfyUrl,
            message: 'Desconectado de ComfyUI'
        });
    });
    
    setupComfyWebSocketHandlers();
}

// Función para enviar mensajes a todos los clientes conectados
function broadcastToClients(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(message));
            } catch (e) {
                console.error('Error broadcasting to client:', e);
            }
        }
    });
}

function setupComfyWebSocketHandlers() {
    wsComfy.on('message', async (data) => {
        const messageString = data.toString();
        console.log('WebSocket message received:', messageString);

        const message = JSON.parse(messageString);

        // Manejar progreso de ejecución
        if (message.type === 'progress') {
            const value = message.data.value;
            const max = message.data.max;
            const percent = Math.round((value / max) * 100);
            
            console.log(`Progress: ${value}/${max} (${percent}%)`);
            
            broadcastToClients({
                type: 'generation_progress',
                value: value,
                max: max,
                percent: percent,
                message: `⚙️ Generando: Step ${value}/${max}`
            });
        }
        
        // Manejar ejecución iniciada
        if (message.type === 'executing') {
            if (message.data.node) {
                console.log(`Executing node: ${message.data.node}`);
                broadcastToClients({
                    type: 'generation_status',
                    status: 'executing',
                    message: '🎨 ComfyUI procesando...'
                });
            }
        }

        if (message.type === 'executed') {
            const details = promptDetails[message.data.prompt_id];
            console.log(`Execution completed for prompt ID: ${message.data.prompt_id}`);

            const images = message.data.output.images;
            console.log('Images:', images);

            for (const image of images) {
                const subfolder = '';
                const parsedUrl = parseComfyUrl(config.comfyUrl);
                const imageUrl = `${parsedUrl.baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(image.type)}`;
                console.log('Downloading image from:', imageUrl);
                
                // Notificar que está descargando
                broadcastToClients({
                    type: 'generation_status',
                    status: 'downloading',
                    message: '📥 Descargando imagen desde ComfyUI...'
                });
                
                const filename = path.join(__dirname, 'public', 'imagenes', subfolder, image.filename);
                await downloadImage(imageUrl, filename, subfolder);
                console.log(`Downloaded image: ${filename}`);

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        const imagePath = subfolder ? `/imagenes/${subfolder}/${image.filename}` : `/imagenes/${image.filename}`;
                        // Usar URL absoluta si está configurada (producción), sino usar ruta relativa (desarrollo)
                        const imageUrl = PUBLIC_URL ? `${PUBLIC_URL}${imagePath}` : `${BASE_PATH}${imagePath}`;
                        console.log(`📤 Sending image URL to client: ${imageUrl}`);
                        client.send(JSON.stringify({
                            type: 'image_generated',
                            url: imageUrl,
                            prompt: details.prompt
                        }));
                    }
                });
            }
        }
    });
}

const app = express();

// Configurar subpath para producción (cuando se accede desde /comfyweb)
const BASE_PATH = process.env.BASE_PATH || '';
const PUBLIC_URL = process.env.PUBLIC_URL || '';

app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

const port = 8085;
const server = http.createServer(app);
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`BASE_PATH: ${BASE_PATH}`);
    console.log(`PUBLIC_URL: ${PUBLIC_URL || '(not set - using relative paths)'}`);
});

const io = require('socket.io')(server);

const wss = new WebSocket.Server({ server });
const promptDetails = {};  // Almacena detalles del prompt

// Conectar a ComfyUI después de que el servidor esté listo
setTimeout(() => {
    connectToComfyUI();
}, 1000);

wss.on('connection', async (ws, req) => {
    console.log('WebSocket client connected');
    
    // Enviar estado actual de conexión al nuevo cliente
    if (wsComfy && wsComfy.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'connection_status',
            status: 'connected',
            url: config.comfyUrl,
            message: 'Conectado a ComfyUI'
        }));
    }
    
    ws.on('message', async (data) => {
        const message = JSON.parse(data);
        if (message.type === 'generarImagen') {
            console.log(`📥 Prompt received: ${message.prompt}`);
            console.log(`📊 Parámetros:`, message.params);
            
            // Notificar al cliente que se está procesando
            ws.send(JSON.stringify({
                type: 'generation_status',
                status: 'queued',
                message: '🔄 Prompt en cola para procesamiento'
            }));
            
            try {
                const params = message.params || {};
                const promptId = await generarImagen(message.prompt, params);
                promptDetails[promptId] = { prompt: message.prompt, ws: ws }; // Guarda prompt y websocket
                
                console.log(`✓ Prompt queued with ID: ${promptId}`);
                console.log(`🔍 WebSocket ComfyUI state: ${wsComfy ? wsComfy.readyState : 'null'} (1=OPEN, 0=CONNECTING, 2=CLOSING, 3=CLOSED)`);
                ws.send(JSON.stringify({
                    type: 'generation_status',
                    status: 'processing',
                    promptId: promptId,
                    message: '⚙️ ComfyUI está generando la imagen...'
                }));
            } catch (error) {
                console.error('❌ Error queuing prompt:', error);
                ws.send(JSON.stringify({
                    type: 'generation_status',
                    status: 'error',
                    message: '❌ Error al enviar prompt a ComfyUI: ' + error.message
                }));
            }
        }
    });
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

io.on('connection', function(socket) {
    console.log('SOCKET IO');
    socket.on('slider change', function(data) {
        console.log('Slider value received: ', data);
        socket.broadcast.emit('slider update', data);
    });
    socket.on('disconnect', function() {
        console.log('User disconnected');
    });
});

// API endpoints para configuración
app.get(BASE_PATH + '/api/config', (req, res) => {
    res.json(config);
});

// Endpoint para obtener modelos disponibles
app.get(BASE_PATH + '/api/models', async (req, res) => {
    try {
        const parsedUrl = parseComfyUrl(config.comfyUrl);
        const httpModule = getHttpModule(config.comfyUrl);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: '/object_info',
            method: 'GET'
        };
        
        const request = httpModule.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                try {
                    const objectInfo = JSON.parse(data);
                    const checkpointLoader = objectInfo.CheckpointLoaderSimple;
                    if (checkpointLoader && checkpointLoader.input && checkpointLoader.input.required) {
                        const models = checkpointLoader.input.required.ckpt_name[0];
                        res.json({ success: true, models });
                    } else {
                        res.json({ success: false, error: 'No se pudo obtener la lista de modelos' });
                    }
                } catch (e) {
                    res.json({ success: false, error: 'Error al parsear respuesta: ' + e.message });
                }
            });
        });
        
        request.on('error', (error) => {
            res.json({ success: false, error: error.message });
        });
        
        request.end();
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post(BASE_PATH + '/api/config', (req, res) => {
    const newConfig = req.body;
    if (!newConfig.comfyUrl) {
        return res.status(400).json({ error: 'comfyUrl is required' });
    }
    
    config = newConfig;
    if (saveConfig(config)) {
        // Reconectar con la nueva configuración
        connectToComfyUI();
        res.json({ success: true, config });
    } else {
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

async function readWorkflowAPI() {
    const data = await fs.promises.readFile(path.join(__dirname, 'workflow_api.json'), 'utf8');
    return JSON.parse(data);
}

async function uploadImage(filePath) {
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));

    const parsedUrl = parseComfyUrl(config.comfyUrl);
    const httpModule = getHttpModule(config.comfyUrl);
    
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: '/upload/image',
        method: 'POST',
        headers: formData.getHeaders()
    };

    return new Promise((resolve, reject) => {
        const req = httpModule.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        });
        req.on('error', (e) => reject(e));
        formData.pipe(req);
    });
}

async function queuePrompt(promptWorkflow) {
    const postData = JSON.stringify({ prompt: promptWorkflow, client_id: clientId });
    const parsedUrl = parseComfyUrl(config.comfyUrl);
    const httpModule = getHttpModule(config.comfyUrl);
    
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: '/prompt',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = httpModule.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve(JSON.parse(data).prompt_id);
            });
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

async function getHistory(promptId) {
    const parsedUrl = parseComfyUrl(config.comfyUrl);
    const httpModule = getHttpModule(config.comfyUrl);
    const url = `${parsedUrl.baseUrl}/history/${promptId}`;
    
    return new Promise((resolve, reject) => {
        httpModule.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function downloadImage(url, filename, subfolder) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(filename);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const filePath = filename;
        const file = fs.createWriteStream(filePath);
        const httpModule = getHttpModule(url);
        
        httpModule.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => reject(err));
        });
    });
}
async function generarImagen_old(promptText) {
    const promptWorkflow = await readWorkflowAPI();
	console.log("PROMPT WORKFLOW" + promptWorkflow)
    promptWorkflow["6"]["inputs"]["text"] = promptText;
    promptWorkflow["3"]["inputs"]["seed"] = Math.floor(Math.random() * 18446744073709551614) + 1;
    const emptyLatentImgNode = promptWorkflow["5"];
    emptyLatentImgNode["inputs"]["batch_size"] = 1;

    promptWorkflow["9"]["inputs"]["filename_prefix"] = "ComfyUI";

    const promptId = await queuePrompt(promptWorkflow);
}

// Función para validar si un modelo existe
async function validateModel(modelName) {
    try {
        const parsedUrl = parseComfyUrl(config.comfyUrl);
        const httpModule = getHttpModule(config.comfyUrl);
        
        return new Promise((resolve) => {
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: '/object_info',
                method: 'GET'
            };
            
            const request = httpModule.request(options, (response) => {
                let data = '';
                response.on('data', (chunk) => {
                    data += chunk;
                });
                response.on('end', () => {
                    try {
                        const objectInfo = JSON.parse(data);
                        const checkpointLoader = objectInfo.CheckpointLoaderSimple;
                        if (checkpointLoader && checkpointLoader.input && checkpointLoader.input.required) {
                            const models = checkpointLoader.input.required.ckpt_name[0];
                            const exists = models.includes(modelName);
                            resolve({ exists, availableModels: models });
                        } else {
                            resolve({ exists: false, availableModels: [] });
                        }
                    } catch (e) {
                        resolve({ exists: false, availableModels: [] });
                    }
                });
            });
            
            request.on('error', () => {
                resolve({ exists: false, availableModels: [] });
            });
            
            request.end();
        });
    } catch (error) {
        return { exists: false, availableModels: [] };
    }
}

async function generarImagen(promptText, params = {}) {
    const promptWorkflow = await readWorkflowAPI();
    
    // Parámetros por defecto
    const steps = params.steps || 6;
    const width = params.width || 512;
    const height = params.height || 512;
    const seed = params.seed || Math.floor(Math.random() * 18446744073709551614) + 1;
    const model = params.model || 'realvisxl.safetensors';
    
    console.log(`🎨 Generando imagen con parámetros:`, { promptText, steps, width, height, seed, model });
    
    // Validar si el modelo existe
    const modelValidation = await validateModel(model);
    if (!modelValidation.exists) {
        console.error(`❌ Modelo "${model}" no encontrado en ComfyUI`);
        console.log(`📋 Modelos disponibles:`, modelValidation.availableModels.slice(0, 5).join(', '));
        
        // Notificar al cliente
        broadcastToClients({
            type: 'generation_status',
            status: 'error',
            message: `❌ Modelo "${model}" no encontrado. Usando modelo por defecto.`
        });
        
        // Usar el primer modelo disponible como fallback
        if (modelValidation.availableModels.length > 0) {
            promptWorkflow["4"]["inputs"]["ckpt_name"] = modelValidation.availableModels[0];
            console.log(`✓ Usando modelo fallback: ${modelValidation.availableModels[0]}`);
        }
    } else {
        console.log(`✓ Modelo "${model}" encontrado`);
        promptWorkflow["4"]["inputs"]["ckpt_name"] = model;
        
        broadcastToClients({
            type: 'generation_status',
            status: 'info',
            message: `✓ Usando modelo: ${model}`
        });
    }
    
    // Configurar parámetros del workflow
    promptWorkflow["6"]["inputs"]["text"] = promptText;
    promptWorkflow["3"]["inputs"]["seed"] = seed;
    promptWorkflow["3"]["inputs"]["steps"] = steps;
    promptWorkflow["5"]["inputs"]["width"] = width;
    promptWorkflow["5"]["inputs"]["height"] = height;
    promptWorkflow["5"]["inputs"]["batch_size"] = 1;
    promptWorkflow["9"]["inputs"]["filename_prefix"] = "ComfyUI";

    const promptId = await queuePrompt(promptWorkflow);

    console.log(`✓ Prompt en cola con ID: ${promptId}`);
    return promptId;
}
