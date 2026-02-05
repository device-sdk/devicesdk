# DeviceSDK Website

Official website for [DeviceSDK](https://devicesdk.com) - A modern TypeScript SDK for building and connecting IoT devices.

## About

This repository contains the marketing and documentation website for DeviceSDK. The site is built with pure HTML, CSS, and JavaScript (jQuery + Tailwind CSS) and is deployed using Cloudflare Pages.

## Features

- 🎨 Modern, gradient-based design
- 📱 Fully responsive layout
- ⚡ Fast loading with Cloudflare Pages
- 🎯 Email signup integration with dashboard
- 📊 Feature showcase and documentation preview

## Tech Stack

- **HTML5** - Semantic markup
- **CSS3** - Custom styles with Tailwind CSS
- **JavaScript** - jQuery for interactions
- **Cloudflare Pages** - Hosting and deployment via Wrangler

## Project Structure

```
devicesdk-website/
├── public/
│   ├── index.html      # Main landing page
│   ├── style.css       # Custom styles
│   └── script.js       # jQuery-powered interactions
├── wrangler.jsonc      # Cloudflare Pages configuration
├── package.json        # Dependencies
└── README.md          # This file
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/device-sdk/website.git
cd website
```

2. Install dependencies:
```bash
npm install
```

### Development

Start the local development server:

```bash
npx wrangler pages dev public
```

The site will be available at `http://localhost:8788`

### Building

Since this is a static site, no build step is required. The `public/` directory contains all deployable assets.

## Deployment

This site is automatically deployed to Cloudflare Pages. Any push to the `main` branch triggers a new deployment.

### Manual Deployment

To manually deploy:

```bash
npx wrangler pages deploy public
```

## Configuration

The site configuration is in `wrangler.jsonc`:

```jsonc
{
  "name": "devicesdk-website",
  "compatibility_date": "2025-01-01",
  "assets": {
    "directory": "./public"
  }
}
```

## Content Sections

- **Hero Section** - Main call-to-action with email signup
- **Features** - 6 key features of DeviceSDK
- **Getting Started** - Quick start guide
- **Documentation** - Links to docs (coming soon)
- **Community** - Community resources (coming soon)

## Contributing

This is a private repository for the DeviceSDK website. If you're part of the team and want to contribute:

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## Links

- **Website**: [devicesdk.com](https://devicesdk.com)
- **Dashboard**: [dash.devicesdk.com](https://dash.devicesdk.com)
- **GitHub**: [github.com/device-sdk](https://github.com/device-sdk)

## License

All rights reserved © 2025 DeviceSDK
