// custom web server from scratch

const net = require("net"); // net module : provides an api for creating TCP servers and clients in Node.js

// Function to handle incoming connections
function newConn(socket) {
    console.log('new connection', socket.remoteAddress, socket.remotePort); // returns client's IP address and port

    socket.on('end', () => {
        // FIN received. The connection will be closed immediately
        console.log('EOF.');
    });

    socket.on('data', (data) => {
        console.log('data:', data.toString()); // Convert Buffer to string for better readability
        socket.write(data); // echo back the data

        // actively closed the connection if the data contains 'q'
        if (data.toString().includes('q')) { // Convert data to string before checking
            console.log('closing.');
            
            socket.end(); // close the connection
        }
    });
}

const server = net.createServer();
server.on('error', (err) => { throw err; });
server.on('connection', newConn);
server.listen({host: '127.0.0.1', port: 1234}, () => {
    console.log("Server is listening on 127.0.0.1:1234")
});

// Start the echo server by running node --enable-source-maps echo_server.js and test it with the nc or socat command