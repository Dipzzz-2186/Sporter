const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

// Middleware dasar
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (optional dulu, tapi gak apa-apa)
app.use(express.static(path.join(__dirname, "public")));

// View engine PUG
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// ROUTES
const sportRoutes = require("./routes/sport.routes");
app.use("/sports", sportRoutes);

// Home test
app.get("/", (req, res) => {
  res.render("home", { title: "Sporter - Beranda" });
});


module.exports = app;
