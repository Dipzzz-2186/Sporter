const express = require("express");
const path = require("path");
require("dotenv").config();

const session = require("express-session");
const flash = require("connect-flash");

const app = express();
const adminRoutes = require("./routes/admin.routes");
const subadminRoutes = require('./routes/subadmin.routes');
const eventRoutes = require("./routes/event.routes");
const standingsRoutes = require("./routes/standings.routes");
const sellerRoutes = require("./routes/seller.routes");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));


// ====== SESSION & FLASH ======
app.use(
  session({
    secret: process.env.SESSION_SECRET || "sporter-secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());

// middleware untuk kirim user & flash ke Pug
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = {
    success: req.flash("success"),
    error: req.flash("error"),
  };
  next();
});
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.currentUser = req.session?.user || null;
  next();
});

app.use('/', standingsRoutes);

// ====== VIEW ENGINE ======
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// ------- IMPORTANT: load allowedSports middleware BEFORE routes that need it -------
const loadAllowedSports = require('./middlewares/allowedSports'); // <-- fixed path
app.use(loadAllowedSports);

// ====== ROUTES ======
const sportRoutes = require("./routes/sport.routes");
const newsRoutes = require("./routes/news.routes");
const homeController = require("./controllers/home.controller");
const authRoutes = require("./routes/auth.routes");
const mediaRoutes = require("./routes/media.routes");
const purchaseRoutes = require('./routes/purchase.routes');

app.get("/", homeController.renderHome);
app.use("/sports", sportRoutes);
app.use("/news", newsRoutes);
app.use("/", eventRoutes); // <== TAMBAH INI
app.use("/", authRoutes); // /login, /logout
app.use("/", mediaRoutes);
app.use("/", require("./routes/store.routes"));
app.use('/orders', require('./routes/orders.routes'));

// mount admin/subadmin AFTER middleware
app.use("/admin", adminRoutes);
app.use('/subadmin', subadminRoutes);
app.use("/seller", sellerRoutes);
app.use('/purchase', purchaseRoutes);

module.exports = app;
