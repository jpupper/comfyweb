// ===================================
// P5.JS INTERACTIVE GRID BACKGROUND
// ===================================

let gridPoints = [];
let stars = [];
let cols, rows;
let spacing = 50;
let mouseAttractRadius = 180;
let returnSpeed = 0.09;
let attractSpeed = 0.05;
let numStars = 200;
let isTouching = false;
let lastTouchX = 0;
let lastTouchY = 0;
let isMousePressed = false;

function setup() {
    // Fix documentado en el MEGASKILL: en pantallas Windows con DPR 1.25/1.5 p5
    // sube la densidad a 2 y el buffer del canvas queda mas grande que el area
    // que p5 cree medir -> `background(0)` no limpia todo y aparecen RAYAS
    // horizontales. Con pixelDensity(1) + limpieza explicita en draw() no pasa.
    pixelDensity(1);
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.position(0, 0);
    canvas.style('z-index', '0');
    canvas.style('position', 'fixed');
    canvas.style('top', '0');
    canvas.style('left', '0');
    canvas.style('pointer-events', 'none');
    canvas.id('p5-background');
    
    // Add global mouse event listeners
    document.addEventListener('mousedown', () => { isMousePressed = true; });
    document.addEventListener('mouseup', () => { isMousePressed = false; });
    
    // Calculate grid dimensions
    cols = Math.ceil(width / spacing) + 1;
    rows = Math.ceil(height / spacing) + 1;
    
    // Create grid points
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let x = i * spacing;
            let y = j * spacing;
            gridPoints.push({
                originX: x,
                originY: y,
                x: x,
                y: y,
                vx: 0,
                vy: 0
            });
        }
    }
    
    // Create stars
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: random(width),
            y: random(height),
            size: random(2, 5),
            speed: random(0.1, 0.5),
            opacity: random(150, 255),
            twinkleSpeed: random(0.01, 0.03),
            twinklePhase: random(TWO_PI)
        });
    }
}

function draw() {
    // Limpieza explicita de TODO el buffer (ver pixelDensity(1) en setup()).
    const _c = drawingContext ? drawingContext.canvas : null;
    if (_c) {
        drawingContext.setTransform(1, 0, 0, 1, 0, 0);
        drawingContext.fillStyle = '#000';
        drawingContext.fillRect(0, 0, _c.width, _c.height);
    } else {
        background(0);
    }

    // Determine effective mouse position (only when pressed/touching)
    let effectiveMouseX = mouseX;
    let effectiveMouseY = mouseY;
    let isInteracting = false;
    
    // Check if user is actively interacting (mouse pressed or touch active)
    if ('ontouchstart' in window) {
        // Mobile: only interact when touching
        if (isTouching) {
            effectiveMouseX = lastTouchX;
            effectiveMouseY = lastTouchY;
            isInteracting = true;
        } else {
            effectiveMouseX = -1000;
            effectiveMouseY = -1000;
        }
    } else {
        // Desktop: only interact when mouse is pressed
        if (isMousePressed) {
            isInteracting = true;
        } else {
            effectiveMouseX = -1000;
            effectiveMouseY = -1000;
        }
    }
    
    // Draw and update stars (behind grid)
    for (let star of stars) {
        // Slow drift movement
        star.x += star.speed;
        if (star.x > width) star.x = 0;
        
        // Mouse interaction - subtle repulsion
        let dx = effectiveMouseX - star.x;
        let dy = effectiveMouseY - star.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 150) {
            let force = map(dist, 0, 150, 0.5, 0);
            star.x -= (dx / dist) * force;
            star.y -= (dy / dist) * force;
        }
        
        // Twinkle effect
        star.twinklePhase += star.twinkleSpeed;
        let twinkle = sin(star.twinklePhase) * 0.5 + 0.5;
        let currentOpacity = star.opacity * twinkle;
        
        // Draw star
        noStroke();
        fill(0, 217, 255, currentOpacity * 0.6); // Cyan with better visibility
        circle(star.x, star.y, star.size);
    }
    
    // Update and draw grid points
    for (let point of gridPoints) {
        // Calculate distance to mouse (using effective position)
        let dx = effectiveMouseX - point.x;
        let dy = effectiveMouseY - point.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        // Apply attraction or return to origin
        if (dist < mouseAttractRadius && dist > 0) {
            // Attract to mouse
            let force = map(dist, 0, mouseAttractRadius, attractSpeed, 0);
            point.vx += (dx / dist) * force;
            point.vy += (dy / dist) * force;
        } else {
            // Return to origin
            let returnX = (point.originX - point.x) * returnSpeed;
            let returnY = (point.originY - point.y) * returnSpeed;
            point.vx += returnX;
            point.vy += returnY;
        }
        
        // Apply velocity with damping
        point.vx *= 0.9;
        point.vy *= 0.9;
        point.x += point.vx;
        point.y += point.vy;
    }
    
    // Draw grid lines - much more visible now
    stroke(0, 217, 255, 40); // Increased opacity significantly
    strokeWeight(2);
    noFill();
    
    // Draw horizontal lines
    for (let j = 0; j < rows; j++) {
        beginShape();
        for (let i = 0; i < cols; i++) {
            let index = i * rows + j;
            if (index < gridPoints.length) {
                let point = gridPoints[index];
                vertex(point.x, point.y);
            }
        }
        endShape();
    }
    
    // Draw vertical lines
    for (let i = 0; i < cols; i++) {
        beginShape();
        for (let j = 0; j < rows; j++) {
            let index = i * rows + j;
            if (index < gridPoints.length) {
                let point = gridPoints[index];
                vertex(point.x, point.y);
            }
        }
        endShape();
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    
    // Recalculate grid
    cols = Math.ceil(width / spacing) + 1;
    rows = Math.ceil(height / spacing) + 1;
    
    // Reset grid points
    gridPoints = [];
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let x = i * spacing;
            let y = j * spacing;
            gridPoints.push({
                originX: x,
                originY: y,
                x: x,
                y: y,
                vx: 0,
                vy: 0
            });
        }
    }
    
    // Reset stars
    stars = [];
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: random(width),
            y: random(height),
            size: random(2, 5),
            speed: random(0.1, 0.5),
            opacity: random(150, 255),
            twinkleSpeed: random(0.01, 0.03),
            twinklePhase: random(TWO_PI)
        });
    }
}

// Touch event handlers for mobile devices
function touchStarted(event) {
    // Only handle touch if it's on the canvas background, not on interactive elements
    if (event && event.target && (event.target.tagName === 'BUTTON' || event.target.tagName === 'A' || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        return true; // Allow default behavior for interactive elements
    }
    isTouching = true;
    lastTouchX = mouseX;
    lastTouchY = mouseY;
    return true; // Do NOT block default scrolling
}

function touchMoved(event) {
    if (isTouching) {
        lastTouchX = mouseX;
        lastTouchY = mouseY;
    }
    return true; // Do NOT block default scrolling
}

function touchEnded(event) {
    isTouching = false;
    return true; // Do NOT block default scrolling
}
