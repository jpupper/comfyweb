// Sistema de logging para la aplicación
const Logger = {
    container: null,
    maxLogs: 50,
    
    init() {
        this.container = document.getElementById('logContainer');
        if (!this.container) {
            console.error('Log container not found');
            return;
        }
        this.log('Sistema de logs iniciado', 'info');
    },
    
    log(message, type = 'info') {
        if (!this.container) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        
        const time = new Date().toLocaleTimeString();
        entry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
        
        this.container.appendChild(entry);
        
        // Mantener solo los últimos N logs
        while (this.container.children.length > this.maxLogs) {
            this.container.removeChild(this.container.firstChild);
        }
        
        // Auto-scroll al final
        this.container.parentElement.scrollTop = this.container.parentElement.scrollHeight;
        
        // También log en consola
        console.log(`[${type.toUpperCase()}] ${message}`);
    },
    
    info(message) {
        this.log(message, 'info');
    },
    
    error(message) {
        this.log(message, 'error');
    },
    
    warning(message) {
        this.log(message, 'warning');
    },
    
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Logger.init());
} else {
    Logger.init();
}
