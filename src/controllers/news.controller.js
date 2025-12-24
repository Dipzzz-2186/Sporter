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
    // Ambil 12 berita terbaru  
    const news = await News.getLatestNews(12);

    const items = news.map((n) => ({
      ...n,
      published_at_formatted: formatDate(n.published_at),
    }));

    const mainArticle = items[0] || null;
    const sideTopArticle = items[1] || null;
    const sideMiniArticles = items.slice(2, 6);   // 4 kecil
    const otherArticles = items;         // sisanya buat grid bawah

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
