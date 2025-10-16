var host = '192.168.0.13:8080'; //ESTE ES EL QUE VA A TOUCHDESIGNER
socket = new WebSocket('ws://' + host);

const imageContainer = document.getElementById('imageContainer');

// Conectar al servidor local (Node.js)
Logger.info(`Conectando al servidor local: ws://${window.location.hostname}:${window.location.port}`);
const ws = new WebSocket(`ws://${window.location.hostname}:${window.location.port}`);

ws.onopen = () => {
    Logger.info('✓ WebSocket conectado al servidor local');
    console.log('WebSocket connection established');
};

ws.onerror = (error) => {
    Logger.error('Error en WebSocket: ' + error.message);
    console.error('WebSocket error:', error);
};

ws.onclose = () => {
    Logger.warning('WebSocket desconectado del servidor');
    console.log('WebSocket closed');
};

ws.onmessage = (event) => {
    console.log('Mensaje WebSocket recibido:', event.data);
    const message = JSON.parse(event.data);
    
    // Manejar mensajes de estado de conexión
    if (message.type === 'connection_status') {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        switch(message.status) {
            case 'connecting':
                Logger.info(`🔄 Conectando a ComfyUI: ${message.url}`);
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator status-disconnected';
                }
                if (statusText) {
                    statusText.textContent = 'Conectando...';
                }
                break;
            case 'connected':
                Logger.info(`✓ ${message.message}`);
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator status-connected';
                }
                if (statusText) {
                    statusText.textContent = 'Conectado';
                }
                // Activar flag de conexión y cargar modelos
                window.comfyConnected = true;
                
                // Resetear y recargar modelos (forzar recarga porque puede ser otra URL)
                if (typeof resetModels === 'function') {
                    resetModels();
                }
                if (typeof loadAvailableModels === 'function') {
                    setTimeout(() => loadAvailableModels(true), 500);
                }
                break;
            case 'error':
                Logger.error(`✗ ${message.message}`);
                if (message.error) {
                    Logger.error(`Detalles: ${message.error}`);
                }
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator status-disconnected';
                }
                if (statusText) {
                    statusText.textContent = 'Error';
                }
                break;
            case 'disconnected':
                Logger.warning(`⚠️ ${message.message}`);
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator status-disconnected';
                }
                if (statusText) {
                    statusText.textContent = 'Desconectado';
                }
                // Marcar como desconectado
                window.comfyConnected = false;
                break;
        }
        return;
    }
    
    // Manejar mensajes de estado de generación
    if (message.type === 'generation_status') {
        Logger.info(`📊 ${message.message}`);
        
        switch(message.status) {
            case 'queued':
                updateProgress('📋 Prompt en cola...', 20);
                break;
            case 'processing':
                updateProgress('⚙️ Generando imagen...', 50);
                break;
            case 'error':
                Logger.error(message.message);
                hideProgress();
                alert('Error: ' + message.message);
                break;
        }
        return;
    }
    
    Logger.info(`Mensaje recibido: ${message.type}`);

    if (message.type === 'image_generated' 
	&& !message.url.includes('temp')) {
		Logger.info(`✓ Imagen generada: ${message.url}`);
		updateProgress('🎨 Descargando imagen...', 80);
		
		
		 // Sending message back to the server
		socket.send(JSON.stringify({
			type: 'terminoImagen',
			prompt: message.prompt,
			url: message.url
		}));
		//ComfyUI_temp_pbbek_00072_.png
        console.log('Imagen generada:', message.url);
        console.log('Prompt:', message.prompt);

        const img = document.createElement('img');
        img.src = message.url;
        img.alt = 'Generated Image';

        img.onload = () => {
            updateProgress('✅ ¡Imagen completada!', 100);
            Logger.info('✅ Imagen cargada exitosamente');
            
            imageContainer.innerHTML = ''; // Clear previous images
            imageContainer.appendChild(img);
            
            // Ocultar barra después de 2 segundos
            setTimeout(() => {
                hideProgress();
            }, 2000);
        };

        img.onerror = () => {
            Logger.error('❌ Error al cargar la imagen');
            hideProgress();
            console.error('Failed to load image:', message.url);
        };
    }
};

// Funciones para la barra de progreso
function showProgress(text = 'Generando...', percent = 0) {
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    
    progressSection.style.display = 'block';
    progressBar.style.width = percent + '%';
    progressText.textContent = text;
    progressPercent.textContent = percent + '%';
}

function hideProgress() {
    document.getElementById('progressSection').style.display = 'none';
}

function updateProgress(text, percent) {
    showProgress(text, percent);
}

document.getElementById('generateButton').addEventListener('click', () => {
    const prompt = document.getElementById('prompt').value;
    if (!prompt) {
        Logger.warning('Prompt vacío');
        alert('Por favor, ingrese un prompt.');
        return;
    }
    
    // Obtener todos los parámetros
    const params = {
        steps: parseInt(document.getElementById('steps').value) || 6,
        width: parseInt(document.getElementById('width').value) || 1080,
        height: parseInt(document.getElementById('height').value) || 1080,
        seed: parseInt(document.getElementById('seed').value) || -1,
        model: document.getElementById('modelSelect').value || 'realvisxl.safetensors'
    };
    
    // Si seed es -1, generar uno aleatorio
    if (params.seed === -1) {
        params.seed = Math.floor(Math.random() * 18446744073709551614) + 1;
        document.getElementById('seed').value = params.seed;
    }
    
    Logger.info(`📤 Enviando prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
    Logger.info(`📊 Parámetros: Steps=${params.steps}, Size=${params.width}x${params.height}, Seed=${params.seed}, Model=${params.model}`);
    showProgress('📤 Enviando prompt a ComfyUI...', 10);
    
    ws.send(JSON.stringify({ 
        type: 'generarImagen', 
        prompt: prompt,
        params: params
    }));
    
    // Simular progreso mientras espera respuesta
    setTimeout(() => {
        updateProgress('⏳ Procesando en ComfyUI...', 30);
        Logger.info('⏳ Esperando respuesta de ComfyUI...');
    }, 500);
});
