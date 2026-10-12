require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');

// Sube public/ del proyecto a la carpeta de la app en el FTP de Ferozo.
//   local:  ./public/**            ->  remoto: /comfyweb/**
// Solo sube lo que cambio (compara tamanios). NO toca .htaccess.
const EXCLUDED = ['node_modules', '.git', '.env', '.env.example', 'agent', 'deploy_scripts', '.vscode', 'README.md', 'package.json', 'package-lock.json'];

async function syncLocalToRemote(client, localFolder, remoteFolder) {
    await client.ensureDir(remoteFolder);

    const remoteList = await client.list();
    const remoteMap = new Map();
    for (const item of remoteList) remoteMap.set(item.name, item);

    for (const item of fs.readdirSync(localFolder)) {
        if (EXCLUDED.includes(item)) continue;
        if (item.startsWith('.ht')) continue; // nunca se sube/edita .htaccess

        const localPath = path.join(localFolder, item);
        const stat = fs.statSync(localPath);

        if (stat.isDirectory()) {
            await syncLocalToRemote(client, localPath, remoteFolder + '/' + item);
            await client.cd(remoteFolder);
        } else {
            const remoteItem = remoteMap.get(item);
            if (!remoteItem || remoteItem.size !== stat.size) {
                console.log('[SUBIENDO] ' + remoteFolder + '/' + item);
                await client.uploadFrom(localPath, item);
            }
        }
    }
}

async function uploadToFtp() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    const ftpHost = process.env.FTP_HOST;
    const ftpUser = process.env.FTP_USER;
    const ftpPassword = process.env.FTP_PASS;
    const remoteBase = process.env.FTP_REMOTE_BASE || '/comfyweb';

    if (!ftpHost || !ftpUser || !ftpPassword) {
        console.error('[FTP] Faltan FTP_HOST / FTP_USER / FTP_PASS en el .env');
        process.exitCode = 1;
        return;
    }

    try {
        console.log('--- FTP comfyweb: subiendo el front a ' + remoteBase + ' ---');
        await client.access({
            host: ftpHost,
            user: ftpUser,
            password: ftpPassword,
            secure: true,
            secureOptions: { rejectUnauthorized: false }
        });

        const localRootFolder = path.join(__dirname, '..', 'public');
        await syncLocalToRemote(client, localRootFolder, remoteBase);

        console.log('==========================================');
        console.log('FTP comfyweb: sincronizacion completada.');
        console.log('==========================================');
    } catch (err) {
        console.error('Error en la subida FTP:', err.message);
        process.exitCode = 1;
    } finally {
        client.close();
    }
}

function rootFolderSafe(p) {
    return p;
}

uploadToFtp();
