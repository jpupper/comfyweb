// ============================================================
// comfyweb - Trabajo (job) pedido desde la web al videocomfy local
// ============================================================
'use strict';

const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
    kind: { type: String, enum: ['image', 'video'], default: 'image', index: true },
    prompt: { type: String, default: '' },
    workflow: { type: String, default: '' },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    imageFilename: { type: String, default: '' },

    status: {
        type: String,
        enum: ['queued', 'running', 'done', 'error', 'cancelled'],
        default: 'queued',
        index: true
    },
    progress: {
        value: { type: Number, default: 0 },
        max: { type: Number, default: 0 },
        node: { type: String, default: '' }
    },
    promptId: { type: String, default: '' },
    log: { type: [String], default: [] },

    // Resultado: SIEMPRE una URL (R2). Nunca el binario en la base.
    resultUrl: { type: String, default: '' },
    resultKey: { type: String, default: '' },
    resultName: { type: String, default: '' },
    resultMime: { type: String, default: '' },
    resultBytes: { type: Number, default: 0 },
    error: { type: String, default: '' },

    user: {
        id: { type: String, default: '' },
        username: { type: String, default: '' },
        email: { type: String, default: '' }
    },
    agentId: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true },
    startedAt: Date,
    finishedAt: Date
}, { minimize: false });

module.exports = mongoose.model('Job', JobSchema);
