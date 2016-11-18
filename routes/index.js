var express = require('express');
var router = express.Router();
var uuid = require('node-uuid');

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index', {
		title: 'Express',
		user: req.session.userdata
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
	var url = req.query.callback ? req.query.callback : '/'
	res.redirect(url);
});

router.get('/logout', function(req, res, next) {
	req.session.userdata = null;
	res.redirect('/');
});


module.exports = router;