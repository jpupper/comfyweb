const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const bodyParser = require('body-parser');
const socketIO = require('socket.io');

const ipglobal = "192.168.0.13"; //ESTA ES LA IP QUE VA AL COMFY
const serverAddress = ipglobal + ":8188";
const clientId = uuidv4();

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

const port = 3000;
const server = http.createServer(app);
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

const io = require('socket.io')(server);

const wss = new WebSocket.Server({ server });
const wsComfy = new WebSocket(`ws://${serverAddress}/ws?clientId=${clientId}`);

wsComfy.on('open', () => {
    console.log('WebSocket connection established');
});

const promptDetails = {};  // Modificado para almacenar detalles de prompt y equipo

wsComfy.on('message', async (data) => {
    const messageString = data.toString();
    console.log('WebSocket message received:', messageString);

    const message = JSON.parse(messageString);

    if (message.type === 'executed') {
        const details = promptDetails[message.data.prompt_id];
        console.log(`Execution completed for prompt ID: ${message.data.prompt_id} for team: ${details.equipo}`);

        const images = message.data.output.images;
        console.log('Images:', images);

        for (const image of images) {
            const subfolder = details.equipo ? `equipo${details.equipo}` : '';
            const imageUrl = `http://${serverAddress}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(image.type)}`;
            console.log('Downloading image from:', imageUrl);
            const filename = path.join(__dirname, 'public', 'imagenes', subfolder, image.filename);
            await downloadImage(imageUrl, filename, subfolder);
            console.log(`Downloaded image: ${filename}`);

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client.equipo === details.equipo) {
                    client.send(JSON.stringify({
                        type: 'image_generated',
                        url: `/imagenes/${subfolder}/${image.filename}`,
                        equipo: details.equipo,
                        prompt: details.prompt  // Envío del prompt original
                    }));
                }
            });
        }
    }
});

wss.on('connection', async (ws, req) => {
    console.log('WebSocket client connected');
    ws.on('message', async (data) => {
        const message = JSON.parse(data);
        if (message.type === 'generarImagen') {
            console.log(`Prompt received: ${message.prompt}`);
            ws.equipo = message.equipo;
            const promptId = await generarImagen(message.prompt, message.equipo);
            promptDetails[promptId] = { equipo: message.equipo, prompt: message.prompt }; // Guarda equipo y prompt
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

async function readWorkflowAPI() {
    const data = await fs.promises.readFile(path.join(__dirname, 'workflow_api.json'), 'utf8');
    return JSON.parse(data);
}

async function uploadImage(filePath) {
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));

    const options = {
        hostname: ipglobal,
        port: 8188,
        path: '/upload/image',
        method: 'POST',
        headers: formData.getHeaders()
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
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
    const options = {
        hostname: ipglobal,
        port: 8188,
        path: '/prompt',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
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
    return new Promise((resolve, reject) => {
        http.get(`http://${serverAddress}/history/${promptId}`, (res) => {
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
        const dir = subfolder ? path.join(__dirname, 'public', 'imagenes', subfolder) : path.dirname(filename);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const filePath = subfolder ? path.join(dir, path.basename(filename)) : filename;

        const file = fs.createWriteStream(filePath);
        http.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => reject(err));
        });
    });
}
async function generarImagen_old(promptText, equipo) {
    const promptWorkflow = await readWorkflowAPI();
	console.log("PROMPT WORKFLOW" + promptWorkflow)
    promptWorkflow["6"]["inputs"]["text"] = promptText;
    promptWorkflow["3"]["inputs"]["seed"] = Math.floor(Math.random() * 18446744073709551614) + 1;
    const emptyLatentImgNode = promptWorkflow["5"];
    emptyLatentImgNode["inputs"]["batch_size"] = 1;

    promptWorkflow["9"]["inputs"]["filename_prefix"] = equipo ? `equipo${equipo}/ComfyUI` : "ComfyUI";

    const promptId = await queuePrompt(promptWorkflow);

    console.log(`Queued prompt with ID: ${promptId} for team: ${equipo}`);
    return promptId;
}

async function generarImagen(promptText, equipo) {
    const promptWorkflow = await readWorkflowAPI();
	console.log("PROMPT WORKFLOW" + promptWorkflow)
    promptWorkflow["6"]["inputs"]["text"] = promptText;
    promptWorkflow["3"]["inputs"]["seed"] = Math.floor(Math.random() * 18446744073709551614) + 1;
    const emptyLatentImgNode = promptWorkflow["5"];
    emptyLatentImgNode["inputs"]["batch_size"] = 1;

    promptWorkflow["9"]["inputs"]["filename_prefix"] = equipo ? `equipo${equipo}/ComfyUI` : "ComfyUI";

    const promptId = await queuePrompt(promptWorkflow);

    console.log(`Queued prompt with ID: ${promptId} for team: ${equipo}`);
    return promptId;
}
