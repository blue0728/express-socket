var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index', {
		title: 'Express',
		user: req.session.userdata,
		timemap: new Date().getTime() + "" + Math.floor(Math.random() * 899 + 100),
		callback: req.query.callback ? '/login?callback=' + req.query.callback : '/login',
		room: req.query.room ? req.query.room : ''
	});
});

router.post('/login', function(req, res, next) {
	req.session.userdata = {
		name: req.body.user,
		uid: req.body.uid
	};
	var url = req.query.callback ? req.query.callback : '/'
	res.redirect(url);
});

router.get('/logout', function(req, res, next) {
	req.session.userdata = null;
	res.redirect('/');
});


module.exports = router;