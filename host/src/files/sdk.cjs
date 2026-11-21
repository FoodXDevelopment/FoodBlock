// The one place this folder reaches the FoodBlock SDK. Signing, hashing, verification, the push check and the pull
// answer are all the SDK's; nothing here reimplements crypto. FOODBLOCK_SDK points elsewhere; by default it is the
// repo's own checkout (../../../sdk/javascript from here), and failing that an installed @foodxdev/foodblock.
const path = require('node:path')
const candidates = [process.env.FOODBLOCK_SDK, path.join(__dirname, '..', '..', '..', 'sdk', 'javascript', 'src', 'index.cjs'), '@foodxdev/foodblock'].filter(Boolean)
let last
for (const candidate of candidates) {
  try { module.exports = require(candidate); last = null; break } catch (error) { last = error }
}
if (last) throw new Error('the FoodBlock SDK was not found (set FOODBLOCK_SDK to its src/index.cjs): ' + last.message)
