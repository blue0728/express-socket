var express = require('express');
var router = express.Router();
var uuid = require('node-uuid');

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index', {
		title: '你画我猜',
		user: req.session.userdata,
		method: req.query.callback ? '/login?callback=' + req.query.callback : '/login'
	});
});

router.get('/room/:id', function(req, res, next) {
	res.render('room', {
		title: 'room',
		user: req.session.userdata,
		roomid: req.params.id
	});
});

router.post('/login', function(req, res, next) {
	req.session.userdata = {
		name: req.body.user,
		uid: uuid.v1()
	};
	return res.json({
		status: 'success',
		msg: '登录成功',
		data: {
			name: req.body.user,
			uid: uuid.v1()
		}
	});
});

router.get('/logout', function(req, res, next) {
	req.session.userdata = null;
	res.redirect('/');
});


module.exports = router;