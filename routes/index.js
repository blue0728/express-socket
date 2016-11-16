var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', {
        title: 'Express',
        user: req.session.userdata,
        timemap: new Date().getTime() + "" + Math.floor(Math.random() * 899 + 100)
    });
});

router.post('/login', function(req, res, next) {
    req.session.userdata = {
        name: req.body.user,
        uid: req.body.uid
    };
    res.redirect('/');
});


module.exports = router;