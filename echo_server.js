const net = require('net');

function soInit(socket) {
    const conn = {
        socket,
        err: null,
        ended: false,
        reader: null
    };

    socket.on('data', (data) => {
        console.assert(conn.reader);
        conn.socket.pause();
        conn.reader.resolve(data);
        conn.reader = null;
    });

    socket.on('end', () => {
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve('');
            conn.reader = null;
        }
    });

    socket.on('error', (err) => {
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
        }
    });

    return conn;
}

function soRead(conn) {
    console.assert(!conn.reader);
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }
        if (conn.ended) {
            resolve('');
            return;
        }
        conn.reader = { resolve, reject };
        conn.socket.resume();
    });
}

function soWrite(conn, data) {
    console.assert(data.length > 0);
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }
        conn.socket.write(data, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function newConn(socket) {
    console.log('new connection', socket.remoteAddress, socket.remotePort);
    try {
        await serveClient(socket);
    } catch (err) {
        console.error('exception', err);
    } finally {
        socket.destroy();
    }
}

async function serveClient(socket) {
    const conn = soInit(socket);
    while (true) {
        const data = await soRead(conn);
        if (data.length === 0) {
            console.log('end connection');
            break;
        }
        console.log('data', data.toString());
        await soWrite(conn, data);
    }
}

// Start the echo server
const server = net.createServer((socket) => {
    newConn(socket);
});

server.listen(3000, () => {
    console.log('Echo server listening on port 3000');

    // --- Client test once server is ready ---
    const client = net.createConnection({ port: 3000 }, () => {
        console.log('connected to server!');
        client.write('Hello, server!\n');
    });

    client.on('data', (data) => {
        console.log('Received from server:', data.toString());
        client.end(); // close the client after receiving response
    });

    client.on('end', () => {
        console.log('Disconnected from server');
        server.close(); // stop the server after the test
    });
});
