const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

// View engine & static
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ROUTES
const sportRoutes = require("./routes/sport.routes"); // <-- ini betul
app.use("/sports", sportRoutes);

// Home basic
app.get("/", (req, res) => {
  res.send("Home jalan!");
});

module.exports = app;
