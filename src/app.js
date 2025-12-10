const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// ROUTES
const sportRoutes = require("./routes/sport.routes");
const homeController = require("./controllers/home.controller");

app.get("/", homeController.renderHome);
app.use("/sports", sportRoutes);

module.exports = app;
