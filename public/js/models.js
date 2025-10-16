// Gestión de modelos disponibles

let availableModels = [];
let modelsLoaded = false;
let lastComfyUrl = '';

// Resetear estado de modelos (cuando cambia la conexión)
function resetModels() {
    modelsLoaded = false;
    availableModels = [];
    Logger.info('🔄 Reseteando lista de modelos...');
}

// Cargar modelos disponibles
async function loadAvailableModels(forceReload = false) {
    // Si ya están cargados y no es forzado, no recargar
    if (modelsLoaded && !forceReload) {
        Logger.info('📋 Modelos ya cargados');
        return;
    }
    
    try {
        Logger.info('🔍 Cargando modelos disponibles de ComfyUI...');
        const response = await fetch(apiUrl('/api/models'));
        const data = await response.json();
        
        if (data.success && data.models && data.models.length > 0) {
            availableModels = data.models;
            Logger.info(`✓ ${data.models.length} modelos encontrados`);
            
            // Actualizar el select de modelos
            const modelSelect = document.getElementById('modelSelect');
            modelSelect.innerHTML = '';
            
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelSelect.appendChild(option);
            });
            
            // Seleccionar realvisxl.safetensors si existe
            if (data.models.includes('realvisxl.safetensors')) {
                modelSelect.value = 'realvisxl.safetensors';
                Logger.info('✓ Modelo realvisxl.safetensors seleccionado por defecto');
            }
            
            modelsLoaded = true;
        } else {
            Logger.warning('⚠️ No se pudieron cargar los modelos: ' + (data.error || 'Sin modelos disponibles'));
            Logger.info('💡 Asegúrate de que ComfyUI esté corriendo y conectado');
        }
    } catch (error) {
        Logger.error('❌ Error al cargar modelos: ' + error.message);
        Logger.info('💡 Verifica que ComfyUI esté conectado correctamente');
    }
}

// Función para randomizar la semilla
function randomizeSeed() {
    const seedInput = document.getElementById('seed');
    const randomSeed = Math.floor(Math.random() * 18446744073709551614) + 1;
    seedInput.value = randomSeed;
    Logger.info(`🎲 Semilla aleatoria: ${randomSeed}`);
}

// Variable global para saber si estamos conectados
window.comfyConnected = false;

// Cargar modelos cuando la página esté lista
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que se establezca la conexión
    setTimeout(() => {
        if (window.comfyConnected) {
            loadAvailableModels();
        } else {
            Logger.info('⏳ Esperando conexión a ComfyUI para cargar modelos...');
        }
    }, 3000);
});
