const News = require("../models/news.model");

function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// List berita (layout ala portal)
exports.renderNewsList = async (req, res) => {
  try {
    // Ambil 20 berita terbaru (6 untuk hero, sisanya untuk grid bawah)
    const news = await News.getLatestNews(20);

    const items = news.map((n) => ({
      ...n,
      published_at_formatted: formatDate(n.published_at),
    }));

    // 6 berita terbaru untuk hero
    const heroArticles = items.slice(0, 6);
    const mainArticle = heroArticles[0] || null;
    const sideTopArticle = heroArticles[1] || null;
    const sideMiniArticles = heroArticles.slice(2, 6);

    // Sisanya untuk bagian Berita Lainnya (hindari duplikasi)
    const otherArticles = items.slice(6);

    res.render("news/index", {
      title: "Berita Olahraga - SPORTER",
      mainArticle,
      sideTopArticle,
      sideMiniArticles,
      otherArticles,
    });
  } catch (err) {
    console.error("ERROR renderNewsList:", err);
    res.status(500).send("Terjadi kesalahan server");
  }
};

// Detail artikel (tidak berubah)
exports.renderNewsDetail = async (req, res) => {
  try {
    const slug = req.params.slug;
    const article = await News.getNewsBySlug(slug);

    if (!article) {
      return res.status(404).send("Berita tidak ditemukan");
    }

    article.published_at_formatted = formatDate(article.published_at);

    res.render("news/detail", {
      title: article.title + " - SPORTER",
      article,
    });
  } catch (err) {
    console.error("ERROR renderNewsDetail:", err);
    res.status(500).send("Terjadi kesalahan server");
  }
};
