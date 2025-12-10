const express = require("express");
const path = require("path");
require("dotenv").config();

const session = require("express-session");
const flash = require("connect-flash");

const app = express();
const adminRoutes = require("./routes/admin.routes");

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

app.use("/admin", adminRoutes);

// ====== VIEW ENGINE ======
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// ====== ROUTES ======
const sportRoutes = require("./routes/sport.routes");
const newsRoutes = require("./routes/news.routes");
const homeController = require("./controllers/home.controller");
const authRoutes = require("./routes/auth.routes");

app.get("/", homeController.renderHome);
app.use("/sports", sportRoutes);
app.use("/news", newsRoutes);
app.use("/", authRoutes); // /login, /logout



module.exports = app;
