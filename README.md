# global-security-intel-app
Global Security OSINT Application

Here is a professional `README.md` you can place in your GitHub repo to explain and support your app deployment:

---

## 🛰️ Global Security Intel Pro

**Live Demo**: [https://your-username.github.io/global-security-intel-app/](https://your-username.github.io/global-security-intel-app/)

An open-source, map-based global security dashboard that aggregates live RSS feeds from official sources (UN, NATO, MSF, etc.) and plots relevant alerts on an interactive Leaflet map.

Built for **NGO security risk managers**, **conflict analysts**, **humanitarian planners**, and **strategic decision-makers** who need a fast, no-login tool for situational awareness.

---

### 🗂️ Project Structure

```
📁 global-security-intel-app/
├── index.html          → Main app interface
├── style.css           → UI styling
├── app.js              → App logic (fetching feeds, parsing, plotting)
├── global_security_rss_feeds.txt → Feed source list
├── README.md           → This file
├── .nojekyll           → Prevent GitHub Pages from ignoring folders
```

---

### 🌐 RSS Feeds Integrated

* [ReliefWeb](https://reliefweb.int/)
* [UN News – Africa](https://news.un.org/)
* [NATO](https://www.nato.int/)
* [ICIJ](https://www.icij.org/)
* [RAND](https://www.rand.org/)
* [Bellingcat](https://www.bellingcat.com/)
* [Crisis Group](https://www.crisisgroup.org/)
* [AFRICOM](https://www.africom.mil/)
* [State Department Travel Advisories](https://travel.state.gov/)
* [MSF](https://www.msf.org/)
* [UNODC](https://www.unodc.org/)

All feeds are hardcoded into `app.js` and can be modified by editing the `feedUrls` array.

---

### 📍 Features

* Interactive Leaflet-based world map
* Dynamic RSS polling
* Real-time feed updates plotted with geolocation tags
* Customizable polling interval
* Built-in RSS error handling
* Clean, mobile-friendly UI

---

### 🚀 Deployment via GitHub Pages

To deploy:

1. Push the app folder to your GitHub repository
2. Enable GitHub Pages (Settings → Pages → Source → `main` branch)
3. Add a `.nojekyll` file to prevent GitHub’s default Jekyll processing
4. Open your published app at:

   ```
   https://your-username.github.io/global-security-intel-app/
   ```

---

### 🔧 Configuration

You can edit the polling interval in `app.js`:

```js
const POLLING_INTERVAL = 10 * 60 * 1000; // every 10 minutes
```

To add or remove RSS feeds, simply modify this array in `app.js`:

```js
const feedUrls = [
  "https://reliefweb.int/updates/rss.xml",
  "https://www.nato.int/cps/rss/en/natohq/rssFeed.xsl/rssFeed.xml",
  ...
];
```

---

### 🧠 Credits

Developed by [M. Nuri Shakoor](https://mnshakoor.com)
In partnership with ARAC International Inc & Quanta Analytica — Risk + Intelligence Tools for Peacebuilders & Analysts

---
###License MIT
