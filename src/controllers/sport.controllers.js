const Sport = require("../models/sport.model");

exports.renderSports = async (req, res) => {
  try {
    const sports = await Sport.getAll();
    res.render("sports/index", {
      title: "Daftar Cabang Olahraga",
      sports
    });
  } catch (err) {
    console.error(err);
    res.send("Error");
  }
};
