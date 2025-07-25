// middleware/auth.js
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      redirect: '/login'
    });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      redirect: '/login'
    });
  }
  
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Admin access required'
    });
  }
  
  next();
};

const checkAuth = (req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = !!req.session.user;
  res.locals.isAdmin = req.session.user?.role === 'admin';
  next();
};

module.exports = {
  requireAuth,
  requireAdmin,
  checkAuth
};