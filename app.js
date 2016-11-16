var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var session = require('express-session')({
	secret: "my-secret",
	resave: true,
	saveUninitialized: true
});
var sharedsession = require('express-socket.io-session');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var index = require('./routes/index');
var users = require('./routes/users');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.use(session);
io.use(sharedsession(session));
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handler
app.use(function(err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render('error');
});

var onlineUsers = [];
var userSocket = {};

io.on('connection', function(socket) {
	socket.on('login', function(user) {
		if (!userSocket[socket.id]) {
			userSocket[socket.id] = socket;
			var onlineUser = {
				name: user.name,
				uid: user.uid,
				socketid: socket.id
			};
			onlineUsers.push(onlineUser)
			io.emit('sys', '上线了', onlineUser);
		}
		io.sockets.emit('online', onlineUsers);
	});

	socket.on('logout', function(userdata) {
		if (socket.handshake.session.userdata) {
			delete socket.handshake.session.userdata;
		}
	});

	socket.on('disconnect', function() {
		if (userSocket.hasOwnProperty(socket.id)) {
			var onlineUser = onlineUsers.filter((item) => {
				return item.socketid != socket.id;
			});
			var offlineUser = onlineUsers.filter((item) => {
				return item.socketid == socket.id;
			});
			onlineUsers = onlineUser;
			io.sockets.emit('online', onlineUsers);
			io.emit('sys', '离线了', offlineUser[0]);
		}
	});

	socket.on('msg', function(from, to, msg) {
		if (to in userSocket) {
			userSocket[to].emit('to', msg)
		}
	})
});

module.exports = server;