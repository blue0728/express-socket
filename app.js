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
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
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

var onlineUsers = []; //在线用户数
var userSocket = {}; //用户对应socket
var roomInfo = {} //游戏房间
var roomId = 0; //房间id 用登陆用户的uid自动生成

io.on('connection', function(socket) {
	login(socket);
	logout(socket);
	//离开房间
	socket.on('leaveRoom', function(roomId) {
		var user = socket.handshake.session.userdata;
		var user = {
			name: user.name,
			uid: user.uid,
			socketid: socket.id
		};
		if (roomInfo[roomId]) {
			roomInfo[roomId].filter((item) => {
				if (item.uid == user.uid) {
					sendRoomMsg(roomId, types.OUTROOM, user); //给房间发送离线用户消息
				}
				return item.uid != user.uid;
			});
		}
	});
});

//消息类型
var types = {
	ALL: 'ALL', //所有用户
	ONLINE: 'ONLINE', //上线
	OFFLINE: 'OFFLINE', //离线
	INROOM: 'INROOM', //进入房间
	OUTROOM: 'OUTROOM', //退出房间
	ROOMMANAGER: 'ROOMMANAGER' //房管
};
var roomManagerID = 10000; //房管初始ID

//获取字符串参数
function getQueryString(name, url) {
	var reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
	var r = url.match(reg);
	if (r != null) {
		return unescape(r[2]);
	}
	return null;
}

//发送系统消息
function sendSystemMessage(type = types.ALL, data = null, msg = '') {
	io.sockets.emit('systemMessage', type, data, msg);
}

//发送当前在线人数
function sendOnlineUsers() {
	io.sockets.emit('onlineUsers', onlineUsers);
}

//发送当前房间数
function sendRoomInfo() {
	io.sockets.emit('roomInfo', roomInfo);
}

//给房间里的用户发送信息
function sendRoomMsg(roomId, type, data, msg = '') {
	io.to(roomId).emit('roomMsg', roomId, type, data, msg);
}

//用户登录
function login(socket) {
	socket.on('login', function() {
		var user = socket.handshake.session.userdata; //从session里面获取当前登录的用户
		var id = socket.id;
		if (!userSocket[id]) {
			userSocket[id] = socket; //给每个用户分配单独的socket连接
			var onlineUser = {
				name: user.name,
				uid: user.uid,
				socketid: socket.id
			};
			onlineUsers.push(onlineUser); //添加到在线用户列表
			sendSystemMessage(types.ONLINE, onlineUser);
		}
		sendOnlineUsers();
		//sendRoomInfo();  //自动创建好房间会发送一条房间信息
		creatRoom(socket); //用户登录自动创建
		//通过房间ID登录
		var url = socket.request.headers.referer;
		var roomId = ''
		var arr = url.split('?');
		if (arr.length > 1) {
			roomId = getQueryString('room', arr[1]);
			if (roomInfo[roomId]) {
				joinRoom(socket, roomId); //直接进入对应房间
			}
		}
	})
};

//用户离线
function logout(socket) {
	socket.on('disconnect', function() {
		var id = socket.id; //当前离线socket.id 连接
		if (userSocket.hasOwnProperty(id)) {
			//把在线用户列表的离线用户删掉
			var onlineUser = onlineUsers.filter((item) => {
				return item.socketid != socket.id;
			});
			//获取离线用户的基本信息
			var offlineUser = onlineUsers.filter((item) => {
				return item.socketid == socket.id;
			});

			onlineUsers = onlineUser; //更新在线用户列表

			delete userSocket[socket.id]; //删除离线socket.id 连接

			//处理房间
			for (roomId in roomInfo) {
				//把离线用户从房间里删除
				roomInfo[roomId] = roomInfo[roomId].filter((item) => {
					if (item.uid == offlineUser[0].uid) {
						sendRoomMsg(roomId, types.OUTROOM, offlineUser[0]); //给房间发送离线用户消息
					}
					return item.uid != offlineUser[0].uid;
				});
				//删除离线用户的创建的空房间
				if (roomInfo.hasOwnProperty(id) && !userSocket.hasOwnProperty(roomId) && roomInfo[roomId].length == 1) {
					delete roomInfo[roomId];
				}
				socket.leave(roomId); //退出房间
			}
			sendRoomInfo(); //更新房间信息
			sendOnlineUsers(); //更新在线用户
			sendSystemMessage(types.OFFLINE, offlineUser[0]); //发送系统消息
		}
	})
}

//创建房间
function creatRoom(socket) {
	var roomId = socket.handshake.session.userdata.uid;
	if (!roomInfo[roomId]) {
		roomInfo[roomId] = [];
		var user = {
			name: '房管',
			type: types.ROOMMANAGER,
			uid: roomManagerID,
			creatUid: socket.handshake.session.userdata.uid //房间创建者
		}
		roomManagerID++;
		roomInfo[roomId].push(user); //给每个房间增加一个房管用户
		socket.join(roomId);
	}
	sendRoomInfo(); //更新房间信息
}

//进入房间
function joinRoom(socket, roomId) {
	var user = socket.handshake.session.userdata;
	var user = {
		name: user.name,
		uid: user.uid,
		socketid: socket.id
	}
	roomInfo[roomId].push(user);
	socket.join(roomId);
	sendRoomInfo(); //更新房间信息
	sendRoomMsg(roomId, types.INROOM, user); //给房间发送进入消息
}

module.exports = server;