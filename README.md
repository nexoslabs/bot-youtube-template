
# YouTube Live Chat Bot
> A Node.js bot for YouTube Live that responds to chat commands, filters bad words, sends automated messages, and relays chat to Discord.

---

## 🌟 Features

- Responds to custom chat commands (configurable)
- Sends automated timed messages to chat
- Basic moderation: filters and warns for banned words
- Welcomes first-time chatters
- Relays all chat messages to a Discord channel via webhook
- Easy YAML configuration (no code changes needed)

---

## 🚀 Quick Start

### 1. Clone the repository
```sh
git clone https://github.com/nexoslabs/bot-youtube-template.git
cd bot-youtube-template
```

### 2. Install dependencies
```sh
npm install
```

### 3. Set up Google credentials
- Go to [Google Cloud Console](https://console.cloud.google.com)
- Enable the **YouTube Data API v3**
- Create OAuth 2.0 credentials (Desktop app)
- Download the `client_secret.json` file and place it in the project root

### 4. Configure the bot
Edit `bot.yml` to customize commands, moderation, timed messages, and Discord webhook.

### 5. Authenticate with Google (first run only)
```sh
node index.js
# Follow the link and paste the code as prompted
```

### 6. Start the bot
```sh
node index.js
```

---

## 🛠 Usage

- The bot will automatically join your active YouTube live stream (must be running on your channel)
- It will post timed messages, respond to chat commands, and relay all chat to Discord
- To add or change commands, edit `bot.yml` and restart the bot
- To moderate new words, add them to `badWords` in `bot.yml`

---

## 🔗 Useful Links

[![Google Cloud](https://img.shields.io/badge/Google-Cloud-blue?style=for-the-badge&logo=google-chrome)](https://console.cloud.google.com)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repo-green?style=for-the-badge&logo=github)](https://github.com/nexoslabs/bot-youtube-template)
[![YouTube Video](https://img.shields.io/badge/YouTube-Video-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/@nexoscreator)
[![Documentation](https://img.shields.io/badge/Documentation-Read%20Now-blue?style=for-the-badge&logo=readthedocs)](https://nexoscreation.tech/docs/)

---

## 🤝 Contributing

We ❤️ contributions! Follow these steps to contribute:

1. 🍴 **Fork** the repository
2. 🌿 **Create** a new branch (`git checkout -b feature/AmazingFeature`)
3. 💾 **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. 🚀 **Push** to the branch (`git push origin feature/AmazingFeature`)
5. 🔃 **Open a Pull Request**

📖 _See our [Contribution Guidelines](CONTRIBUTING.md) for more details._

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## 📬 Contact & Community

💬 Join us on **Discord**: [Click Here](https://discord.gg/H7pVc9aUK2)  
🐦 **Follow on Twitter**: [@nexoslabs](https://twitter.com/nexoslabs)  
📧 **Email**: [contact@nexoscreation.tech](mailto:contact@nexoscreation.tech)

<p align="center">
  Made with ❤️ by the <a href="https://github.com/nexoslabs">@nexoslabs</a> Team
</p>

<p align="center">
  <a href="https://github.com/nexoslabs/bot-youtube-template/stargazers">⭐ Star us on GitHub!</a>
</p>