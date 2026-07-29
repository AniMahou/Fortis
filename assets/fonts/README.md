# Fonts

The design system specifies **Inter** (docs/design/DESIGN_TOKENS.md). It is not
bundled in this repo — the app falls back to the platform UI font, which on
Android is Roboto. Both are neutral grotesques at a similar optical size, so
the type scale in `src/theme/tokens.ts` reads as designed either way.

If you want the real thing (it is a visible improvement on the headings):

1. Download the static TTFs from https://github.com/rsms/inter/releases
2. Drop these three into this folder:
   - `Inter-Regular.ttf`
   - `Inter-SemiBold.ttf`
   - `Inter-Bold.ttf`
3. Link them:
   ```bash
   npx react-native-asset
   ```
4. In `src/theme/tokens.ts`, replace the `fontFamily` and `fontFamilyMedium`
   definitions with `'Inter-Regular'` and `'Inter-SemiBold'`, and set
   `headlineLg`/`headlineLgMobile` to `'Inter-Bold'`.

Android matches bundled fonts by **filename**, not by family name plus weight,
so each weight needs its own explicit `fontFamily`. Setting `fontWeight: '700'`
on `Inter-Regular` gets you a synthetically emboldened Regular, which looks
noticeably worse than the real Bold.
