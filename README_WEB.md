# TNVA CLOCK Studio R19

Trình thiết kế responsive cho màn E-Ink 212×104 và 104×212. R19 dùng cùng firmware/giao thức R18.

- Mở `index.html` qua HTTPS/GitHub Pages để dùng Web Bluetooth.
- Chế độ ngoại tuyến dùng được cho thiết kế/xuất file.
- Chỉ phần kết nối/gửi BLE yêu cầu trình duyệt Chromium và HTTPS.

# TNVA CLOCK Studio R18

Deploy the **contents** of this `weble` directory to the GitHub Pages root.

Main URL: `index.html`

Legacy URLs `faces.html` and `weble.html` redirect to the main app.

## Browser support

Web Bluetooth requires a Chromium-based browser and HTTPS (GitHub Pages is HTTPS). On Android use Chrome/Brave/Edge with Bluetooth enabled. iPhone/iPad Safari does not provide standard Web Bluetooth support.

## Layout

- Desktop: horizontal tab bar, multi-column face library, two-column image/countdown tools.
- Phone: fixed bottom tab bar, large touch targets, one/two-column responsive cards, scrollable designer tool rail.
- Switching tabs does not recreate or disconnect the BLE object.

## Warehouse

`warehouse/index.json` contains 140 layouts for the 212×104 panel only:

- 123 landscape
- 17 portrait

Each package is CRC-checked TNF1 and below the firmware's 4 KB limit.
## Fonts

The Design tab can load a Google Font family for static labels and browser preview. The page loads it from `fonts.googleapis.com` when online and falls back to local fonts when offline. Dynamic values on the DA14585 use the embedded 1-bit Roboto Condensed/DSEG renderer so the firmware stays inside its RAM/ROM limits.

