var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index', {
		title: 'Express',
		user: req.session.userdata
	});
});

router.post('/login', function(req, res, next) {
	req.session.userdata = req.body.user;
	res.redirect('/');
});


module.exports = router;