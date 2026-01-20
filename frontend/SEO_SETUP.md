# SEO Setup Instructions

## Files to Copy

The SEO assets need to be copied to the `public` folder for Vite to serve them correctly:

1. **Favicon**: Copy `Image/faviconkeycube.svg` to `public/favicon.svg`
2. **SEO Image**: Copy `Image/SEOimage.png` to `public/og-image.png`

## Quick Copy Commands

### Windows (PowerShell):
```powershell
Copy-Item frontend\Image\faviconkeycube.svg frontend\public\favicon.svg
Copy-Item frontend\Image\SEOimage.png frontend\public\og-image.png
```

### Linux/WSL:
```bash
cp frontend/Image/faviconkeycube.svg frontend/public/favicon.svg
cp frontend/Image/SEOimage.png frontend/public/og-image.png
```

### Or use the provided script:
```bash
chmod +x frontend/copy-seo-assets.sh
./frontend/copy-seo-assets.sh
```

## SEO Meta Tags Added

The following SEO optimizations have been added to `index.html`:

✅ **Primary Meta Tags**
- Title: "TEK Dashboard | Solana Yield Tracker | The Eternal Key Portal"
- Description: "Access the TEK Dashboard to track SOL rewards, token balance, yield performance, and protocol metrics in real time. Built on the Solana blockchain."
- Keywords, author, robots, language

✅ **Open Graph Tags** (Facebook, LinkedIn, etc.)
- og:title, og:description, og:image
- og:image dimensions (1200x630)
- og:site_name, og:locale

✅ **Twitter Card Tags**
- twitter:card (summary_large_image)
- twitter:title, twitter:description, twitter:image

✅ **Additional SEO**
- Theme color (#0066FF)
- Canonical URL
- Favicon and Apple touch icon

## Testing

After copying the files and deploying:

1. **Favicon**: Check browser tab - should show the key cube icon
2. **SEO Preview**: Use these tools to test:
   - [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - [Twitter Card Validator](https://cards-dev.twitter.com/validator)
   - [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

## Notes

- The canonical URL is set to `https://dashboard.tekprotocol.com/` - update this if your domain is different
- The og:image and twitter:image URLs use the same domain - update if needed
- All meta tags are optimized for social media sharing
