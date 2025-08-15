let equiposelect;

var host = '192.168.0.13:8080'; //ESTE ES EL QUE VA A TOUCHDESIGNER
socket = new WebSocket('ws://' + host);

document.addEventListener('DOMContentLoaded', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    equiposelect = urlParams.get("equipo");
    console.log("Equipo seleccionado:", equiposelect);
});

const imageContainer = document.getElementById('imageContainer');
const ws = new WebSocket(`ws://${window.location.hostname}:${window.location.port}`);

ws.onopen = () => {
    console.log('WebSocket connection established');
};

ws.onmessage = (event) => {
    console.log('Mensaje WebSocket recibido:', event.data);
    const message = JSON.parse(event.data);


    if (message.type === 'image_generated' 
	&& message.equipo === equiposelect
	&& !message.url.includes('temp')) {
		
		
		 // Sending message back to the server
		socket.send(JSON.stringify({
			type: 'terminoImagen',
			prompt: message.prompt,
			url: message.url,
			equipo: equiposelect
		}));
		//ComfyUI_temp_pbbek_00072_.png
        console.log('Imagen generada:', message.url);
        console.log('Prompt:', message.prompt);

        const img = document.createElement('img');
        img.src = message.url;
        img.alt = 'Generated Image';

        img.onload = () => {
            imageContainer.innerHTML = ''; // Clear previous images
            imageContainer.appendChild(img);
        };

        img.onerror = () => {
            console.error('Failed to load image:', message.url);
        };
    }
};

document.getElementById('generateButton').addEventListener('click', () => {
    const prompt = document.getElementById('prompt').value;
    if (!prompt) {
        alert('Por favor, ingrese un prompt.');
        return;
    }
    ws.send(JSON.stringify({ type: 'generarImagen', prompt, equipo: equiposelect }));
});
