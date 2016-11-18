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
var roomInfo = {}; //游戏房间
//类型
var types = {
	ALL: 'ALL', //所有用户
	ONLINE: 'ONLINE', //上线
	OFFLINE: 'OFFLINE', //离线
	INROOM: 'INROOM', //进入房间
	OUTROOM: 'OUTROOM', //退出房间
	TEXTMSG: 'TEXTMSG', //发送消息
	TOURIST: 'TOURIST', //游客
	PLAYERDRAW: 'PLAYERDRAW', //画
	PLAYGUESS: 'PLAYGUESS', //猜
	WAIT: 'WAIT', //等待中
	START: 'START' //已经开始
};

var cn = {
	ALL: '所有人', //所有用户
	ONLINE: '上线', //上线
	OFFLINE: '离线', //离线
	INROOM: '进入房间', //进入房间
	OUTROOM: '离开房间', //退出房间
	TEXTMSG: '发送消息', //发送消息
	TOURIST: '游客', //游客
	PLAYERDRAW: '画', //画
	PLAYGUESS: '猜', //猜
	WAIT: '等待游戏', //等待中
	START: '开始游戏' //已经开始
}

io.on('connection', function(socket) {
	//登录
	socket.on('login', function() {
		var user = socket.handshake.session.userdata; //从session里面获取当前登录的用户
		var onlineUser = {};
		var id = socket.id;
		if (!userSocket[id]) {
			userSocket[id] = socket; //给每个用户分配单独的socket连接
			onlineUser = {
				name: user.name,
				uid: user.uid,
				socketid: socket.id,
				type: types.TOURIST //游客
			};
			onlineUsers.push(onlineUser); //添加到在线用户列表
			sendSystemMessage(types.ONLINE, onlineUser);
		}
		sendOnlineUsers(); //在线人数

		//通过房间ID登录
		var url = socket.request.headers.referer;
		var splited = url.split('/');
		if (splited[splited.length - 2] == 'room') {
			var roomId = splited[splited.length - 1]; // 获取房间ID
			if (!roomInfo[roomId]) {
				roomInfo[roomId] = {
					status: types.WAIT,
					palyer: [],
					users: []
				};
			}
			roomInfo[roomId].users.push(onlineUser);
			socket.join(roomId);
			sendRoomInfo(); //更新房间信息
			sendRoomMsg(roomId, types.INROOM, user); //给房间发送进入消息
			sendRoomById(roomId); //发送当前房间信息
		}
	});

	//用户离线
	socket.on('disconnect', function() {
		var id = socket.id; //当前离线socket.id 连接
		if (userSocket.hasOwnProperty(id)) {
			//获取在线用户列表
			var onlineUser = onlineUsers.filter((item) => {
				return item.socketid != socket.id;
			});
			//获取离线用户列表
			var offlineUser = onlineUsers.filter((item) => {
				return item.socketid == socket.id;
			});
			onlineUsers = onlineUser; //更新在线用户列表

			delete userSocket[socket.id]; //删除离线socket.id 连接

			//处理房间
			var key;
			for (key in roomInfo) {
				//把离线用户从房间里删除
				roomInfo[key] = roomInfo[key].users.filter((item) => {
					if (item.uid == offlineUser[0].uid) {
						socket.leave(key); //退出房间
						sendRoomMsg(key, types.OUTROOM, offlineUser[0]); //给房间发送离线用户消息
						sendRoomById(key); //发送当前房间信息
						if (item.type == types.PLAYERDRAW || item.type == types.PLAYGUESS) { //正在参与游戏的人退出了，游戏重新开始
							playReStart(key); //游戏重新开始
						}
					}
					return item.uid != offlineUser[0].uid;
				});
				if (roomInfo[key].length == 0) {
					delete roomInfo[key];
				}
			}

			sendRoomInfo(); //更新房间信息
			sendOnlineUsers(); //更新在线用户
			sendSystemMessage(types.OFFLINE, offlineUser[0]); //发送系统消息
		}
	});

	//离开房间
	socket.on('leaveRoom', function(roomId) {
		var user = socket.handshake.session.userdata;
		var user = {
			name: user.name,
			uid: user.uid,
			socketid: socket.id
		};
		if (roomInfo[roomId]) {
			roomInfo[roomId].users.filter((item) => {
				if (item.uid == user.uid) {
					if (item.type == types.PLAYERDRAW || item.type == types.PLAYGUESS) { //正在参与游戏的人退出了，游戏重新开始
						playReStart(roomId); //游戏重新开始
					}
					sendRoomMsg(roomId, types.OUTROOM, user); //给房间发送离线用户消息
				}
				return item.uid != user.uid;
			});
		}
	});

	//接收房间消息
	socket.on('message', function(roomId, type, msg) {
		var user = socket.handshake.session.userdata;
		//验证发送消息用户是否在该房间
		var userSelf = roomInfo[roomId].users.filter((item) => {
			return item.uid == user.uid;
		})
		if (userSelf.length > 0) {
			sendRoomMsg(roomId, type, userSelf[0], msg); //给房间发送文本消息
		}
	})

	//游戏准备
	socket.on('ready', function(roomId, type) {
		var user = socket.handshake.session.userdata;
		if (roomInfo[roomId]) {
			//更新房间里面用户状态
			roomInfo[roomId].users.forEach((item) => {
				if (item.uid == user.uid) {
					if (item.type == types.TOURIST) {
						item.type = type;
						if (roomInfo[roomId].palyer.length < 2) {
							roomInfo[roomId].palyer.push(item); //把游戏参与者加入到player里面
							sendPlayStatus(roomId, type, user); //发送游戏状态
						}
						if (roomInfo[roomId].palyer.length == 2) {
							roomInfo[roomId].status = types.START; //房间游戏开始了
							sendPlayStatus(roomId, types.START, roomInfo[roomId].palyer); //发送游戏状态
						}
					} else {
						sendToUserMessage(socket.id, '你已经选择' + cn[item.type]);
					}
					return false;
				}
			});

		}
		//更新在线用户状态
		onlineUsers.forEach((item) => {
			if (item.uid == user.uid) {
				if (item.type == types.TOURIST) {
					item.type = type;
					sendPlayStatus(roomId, type, user); //发送游戏准备状态
				}
			}
		})
		sendOnlineUsers();
		sendRoomInfo();
	})

});


//发送系统消息
function sendSystemMessage(type = types.ALL, data = null, msg = '') {
	io.sockets.emit('systemMessage', type, data, msg);
}

//给某个用户发消息
function sendToUserMessage(id, msg) {
	userSocket[id].emit('notice', msg)
}

//发送当前在线人数
function sendOnlineUsers() {
	io.sockets.emit('onlineUsers', onlineUsers);
}

//发送当前房间数
function sendRoomInfo() {
	io.sockets.emit('roomInfo', roomInfo);
}

//发送某个id房间的信息
function sendRoomById(roomId) {
	io.to(roomId).emit('roomById', roomInfo[roomId]);
}

//给房间里的用户发送信息
function sendRoomMsg(roomId, type, data, msg = '') {
	io.to(roomId).emit('roomMsg', roomId, type, data, msg);
}

//发送游戏准备消息
function sendPlayStatus(roomId, type, user) {
	io.to(roomId).emit('playStatus', roomId, type, user);
	sendRoomById(roomId); //发送当前房间信息
}

//游戏重新开始
function playReStart(roomId) {
	var playerId;
	if (roomInfo[roomId]) {
		roomInfo[roomId].status = types.WAIT;
		roomInfo[roomId].users.forEach((item) => {
			if (item.type != types.TOURIST) {
				playerId = item.uid;
				item.type == types.TOURIST; //房间里面的人重新变成游客状态
			}
		})
	};
	onlineUsers.forEach((item) => {
		if (item.uid == playerId) {
			item.type == types.TOURIST; //在线状态变更
		}
	})
	sendRoomById(roomId); //发送当前房间信息
}

//给房间里的用户发送图行坐标
function sendRoomDrawMsg(roomId, from, data) {
	io.to(roomId).emit('roomDraw', from, data);
}

module.exports = server;