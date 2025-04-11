import * as net from 'net';

// A promise based API for TCP sockets
type TCPConn = {
    // the JS socket object
    socket: net.Socket; // the raw TCP socket
    // from the 'error' event
    err: null|Error; // current error, or null
    // EOF, from the 'end' event
    ended: boolean; // true if the connection has ended
    // the callbacks of the promise of the current read
    reader: null|{
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
};

// create a wrapper from the net.Socket
function soInit(socket: net.Socket): TCPConn {
    const conn: TCPConn = {
        socket: socket, err: null, ended: false, reader: null,
    };

    console.log("Initializing a socket");

    socket.on('data', (data: Buffer) => {
        console.assert(conn.reader);
        // pause the 'data' event until the next read
        conn.socket.pause();
        // fulfill the promise of the current read
        conn.reader!.resolve(data);
        conn.reader = null;
    });
    socket.on('end', () => {
        // this also fulfills the current read
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve(Buffer.from('')); // EOF
            conn.reader = null;
            console.log(conn.reader);
        }
    });
    socket.on('error', (err: Error) => {
        // errors are also delivered to the current read
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
            console.log(conn.reader);
        }
    });
    console.log("this is our connection: ", conn);
    return conn;
}


function soRead(conn: TCPConn): Promise<Buffer> {
    console.assert(!conn.reader); // no concurrent calls
    return new Promise((resolve, reject) => {
        // if the connection is not readable, complete the promise now
        if (conn.err) {
            reject(conn.err);
            return;
        }
        if (conn.ended) {
            resolve(Buffer.from('')); // EOF
            return;
        }
        console.log(conn.reader);
        // save the promise callbacks
        conn.reader = {resolve: resolve, reject: reject};
        console.log(conn.reader);
        // and resume the 'data' event to fulfill the promise later
        conn.socket.resume();
    });
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
    console.assert(data.length > 0);
    console.log(data);
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }

        conn.socket.write(data, (err?: Error) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function newConn(socket: net.Socket): Promise<void> {
    console.log('new connection', socket.remoteAddress, socket.remotePort);
    try {
        await serveClient(socket);
        console.log("awaiting");
    } catch (exc) {
        console.error('exceptio:', exc);
    } finally {
        socket.destroy();
        console.log("socket is being destroyed");
    }
}

// A dynamic-sized buffer
type DynBuf = {
    data: Buffer, // the actual storage in memory
    length: number, // how much of it is currently used
};

// echo server
async function serveClient(socket: net.Socket): Promise<void> {
    const conn: TCPConn = soInit(socket);
    console.log("connection: ", conn);
    const buf: DynBuf = {data: Buffer.alloc(0), length: 0};
    while (true) {
        // try to get 1 message from the buffer
        const msg: null|Buffer = cutMessage(buf);
        if(!msg){
            // need more data
            const data : Buffer = await soRead(conn);
            bufPush(buf, data);
            console.log("pushing data to buffer");
            // EOF?
            if (data.length === 0) {
                console.log('end connection');
                return;
            }
            // got some data, try it again
            continue;

        }
        // process the message and send the response
        if (msg.equals(Buffer.from('quit\n'))) {
            await soWrite(conn, Buffer.from('Bye.\n'));
            console.log("socket is being destroyed");
            socket.destroy();
            return;
        } else {
            const reply = Buffer.concat([Buffer.from('Echo: '), msg]);
            console.log(reply);
            await soWrite(conn, reply);
        }
    } // loop for messages
}

function cutMessage(buf: DynBuf): null|Buffer {
    // messages are seperated by '\n'
    const idx = buf.data.subarray(0, buf.length).indexOf('\n');
    if (idx < 0) {
        return null; // not complete
    }
    // make a copy of the message and move the remaining data to the front
    const msg = Buffer.from(buf.data.subarray(0, idx + 1));
    bufPop(buf, idx + 1);
    console.log(msg);
    return msg
}

function bufPop(buf: DynBuf, len: number): void {
    buf.data.copyWithin(0, len, buf.length);
    buf.length -= len;
}


// append data to DynBuf
function bufPush(buf: DynBuf, data: Buffer): void {
    const newLen = buf.length + data.length;
    if (buf.data.length < newLen) {
        // grow the capacity by the power of two
        let cap = Math.max(buf.data.length, 32);
        while (cap < newLen) {
            cap *= 2;
        }
        const grown = Buffer.alloc(cap);
        buf.data.copy(grown, 0, 0);
        buf.data = grown;
    }
    data.copy(buf.data, buf.length, 0);
    buf.length = newLen;
}

const server = net.createServer((socket) => {
    newConn(socket); // handle each new connection
});

server.listen(3000, () => {
    console.log('Echo server listening on port 3000')
});
