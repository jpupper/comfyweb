// Cargar configuración al iniciar
async function loadConfig() {
    try {
        Logger.info('Cargando configuración...');
        const response = await fetch('/api/config');
        const config = await response.json();
        
        document.getElementById('comfyUrl').value = config.comfyUrl;
        document.getElementById('currentUrl').textContent = `URL actual: ${config.comfyUrl}`;
        
        Logger.info(`Configuración cargada: ${config.comfyUrl}`);
        Logger.info(`Modo: ${config.isRemote ? 'Remoto (Colab)' : 'Local'}`);
        
        // Actualizar indicador de estado (asumimos conectado si hay config)
        updateStatusIndicator(true);
    } catch (error) {
        Logger.error('Error al cargar configuración: ' + error.message);
        updateStatusIndicator(false);
    }
}

// Guardar configuración
async function saveConfig() {
    const comfyUrl = document.getElementById('comfyUrl').value.trim();
    
    if (!comfyUrl) {
        Logger.error('URL vacía');
        alert('Por favor ingrese una URL válida');
        return;
    }
    
    // Validar formato de URL
    try {
        new URL(comfyUrl);
        Logger.info(`Validando URL: ${comfyUrl}`);
    } catch (e) {
        Logger.error('URL inválida: ' + e.message);
        alert('URL inválida. Debe incluir el protocolo (http:// o https://');
        return;
    }
    
    try {
        Logger.info('Guardando configuración...');
        const isRemote = comfyUrl.includes('trycloudflare.com') || 
                        comfyUrl.includes('colab.dev') || 
                        comfyUrl.startsWith('https://');
        
        Logger.info(`Tipo de conexión: ${isRemote ? 'Remota' : 'Local'}`);
        
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                comfyUrl: comfyUrl,
                isRemote: isRemote
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            Logger.info('✓ Configuración guardada exitosamente');
            Logger.info('El servidor se está reconectando a ComfyUI...');
            document.getElementById('currentUrl').textContent = `URL actual: ${comfyUrl}`;
            
            // No recargar la página, el servidor enviará el estado de conexión
        } else {
            Logger.error('Error al guardar: ' + (result.error || 'Unknown error'));
            alert('Error al guardar configuración: ' + (result.error || 'Unknown error'));
            updateStatusIndicator(false);
        }
    } catch (error) {
        Logger.error('Error de red: ' + error.message);
        alert('Error al guardar configuración');
        updateStatusIndicator(false);
    }
}

// Preset para localhost
function setLocalhost() {
    document.getElementById('comfyUrl').value = 'http://localhost:8188';
}

// Preset para Colab (el usuario debe pegar su URL de Cloudflare)
function setColab() {
    const url = prompt('Ingrese la URL de Cloudflare Tunnel de su Colab\n(ejemplo: https://concentrations-roger-valuable-alfred.trycloudflare.com)');
    if (url) {
        document.getElementById('comfyUrl').value = url.trim();
    }
}

// Actualizar indicador de estado
function updateStatusIndicator(connected) {
    const indicator = document.getElementById('statusIndicator');
    if (connected) {
        indicator.classList.remove('status-disconnected');
        indicator.classList.add('status-connected');
    } else {
        indicator.classList.remove('status-connected');
        indicator.classList.add('status-disconnected');
    }
}

// Cargar configuración al cargar la página
document.addEventListener('DOMContentLoaded', loadConfig);
