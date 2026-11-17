# MT Dubber AI – កម្មវិធី AI បកប្រែ និងបញ្ចូលសំឡេងខ្មែរលើវីដេអូ (AI Video Dubbing to Khmer)

កម្មវិធីនេះត្រូវបានបង្កើតឡើងដើម្បី replicate និងពង្រឹងសមត្ថភាពដូច **MT Dubber Free** ដោយប្រើប្រាស់ **Gemini Multimodal Module ជំនាន់ចុងក្រោយ (Gemini 3.8 Flash, 3.5 Flash, 3.5 Flash Lite, 3.7 Flash, 3.6 Flash)** និងសំឡេង **Edge Neural Khmer Voice (Piseth ♂ & Sreymom ♀)** ដោយរៀបចំរចនាសម្ព័ន្ធយ៉ាងពិសេសដើម្បី **កាត់បន្ថយការស៊ី API Key (Tokens) ឱ្យនៅកម្រិតទាបបំផុត**!

---

## 🌟 លក្ខណៈពិសេសចម្បង (Key Features)

1. **ដំណើរការទាំងស្រុងលើ Browser (Client-Side) ឬ Local Server**:
   - មិនចាំបាច់ដំឡើងអ្វីស្មុគស្មាញឡើយ គ្រាន់តែបើក `index.html` លើ Chrome ឬ Edge ឬដំណើរការ `python server.py`។
   - វីដេអូ និងទិន្នន័យមិនចាកចេញពីកុំព្យូទ័ររបស់អ្នកឡើយ (Privacy-First)។

2. **Gemini API Module ជំនាន់ថ្មីបំផុត (Gemini 3.8, 3.5, 3.7, 3.6)**:
   - គាំទ្រ `gemini-3.8-flash` (ម៉ូឌែល Flagship ថ្មីបំផុត ល្បឿនលឿន និងសមត្ថភាពខ្ពស់ ជំនួស 2.0-flash)
   - គាំទ្រ `gemini-3.5-flash` និង `gemini-3.5-flash-lite` (ល្បឿនលឿនបំផុត ជំនួស 2.0-flash-lite)
   - គាំទ្រ `gemini-3.7-flash` និង `gemini-3.6-flash` (មានប្រព័ន្ធ Bypass Error 503 ដោយស្វ័យប្រវត្តិ)
   - គាំទ្រ `gemini-3.8-pro` និង `gemini-3.1-pro-preview`
   - មានប៊ូតុង **↻ Load Models** ទាញយកឈ្មោះ Model ពីគណនី Google AI Studio ដោយស្វ័យប្រវត្តិ។

3. **បច្ចេកវិទ្យាកាត់បន្ថយការស៊ី API Key ឱ្យតិចបំផុត (API Token Saving Strategy)**:
   - **One-Pass Multimodal Prompt**: រួមបញ្ចូលការស្តាប់សំឡេង (Transcribe) + បកប្រែជាភាសាខ្មែរ (Translate) + ចាប់ពេលវេលា (Timestamps) + កំណត់ភេទអ្នកនិយាយ (Speaker Gender Diarization ♂/♀) ក្នុង **API Call តែមួយគត់**! (សន្សំ API បានជាង 60% ទៅ 70% ធៀបនឹងការហៅ 3 ដង)។
   - **16kHz Mono Resampling**: បម្លែងសំឡេងវីដេអូពី 48kHz Stereo មកត្រឹម 16kHz Mono Float32Array PCM មុនពេលបញ្ជូនទៅ Gemini ដែលកាត់បន្ថយទំហំ Data Payload និងចំនួន Token អូឌីយ៉ូយ៉ាងច្រើន។
   - **Silence Detection (រំលងកន្លែងស្ងាត់)**: គណនាថាមពលសំឡេង (RMS); ប្រសិនបើចន្លោះណាគ្មានសំឡេងនិយាយ កម្មវិធីនឹងមិនផ្ញើទៅ Gemini ឡើយ (សន្សំបាន 100% ត្រង់កន្លែងស្ងាត់)។
   - **Strict Compact JSON Schema**: កំណត់ទម្រង់ឆ្លើយតបជា JSON សុទ្ធ `[{"s":0,"e":2,"g":"m","text":"...","km":"..."}]` ដោយគ្មានពាក្យសម្ដីរៀបរាប់ ឬ Markdown នាំឱ្យខាត Output Tokens។
   - **Multi-Key Pool & 429 Cooldown**: អ្នកអាចដាក់ API Key ច្រើន (ម្នាក់ 2-5 keys, មួយជួរមួយ key)។ កម្មវិធីនឹងបង្វិល key ប្រើឆ្លាស់គ្នា ហើយប្រសិនបើ Key ណាជាប់ Limit (HTTP 429) វានឹងសម្រាក (Cooldown 45s) ហើយប្ដូរទៅ Key បន្ទាប់ដោយស្វ័យប្រវត្តិ។
   - **Zero-Gemini-Token Voice Engine**: ការបង្កើតសំឡេងនិយាយខ្មែរ គឺប្រើប្រាស់ **Microsoft Edge Neural Voice (Piseth ♂ / Sreymom ♀)** 100% ឥតគិតថ្លៃ មិនស៊ី Token របស់ Gemini សូម្បីតែ 1 Token ឡើយ!
   - **Subtitles Import Bypass**: ប្រសិនបើអ្នកមាន File អក្សររត់ស្រាប់ (.srt, .vtt, .txt) អ្នកអាច Import ចូលដើម្បីបង្កើតសំឡេងភ្លាមៗ ដោយមិនបាច់ប្រើ Gemini API សូម្បីតែមួយ Call!

4. **កម្មវិធីកែសម្រួលអត្ថបទ និងប្ដូរសំឡេង (Interactive Script Editor)**:
   - កែសម្រួលអត្ថបទបកប្រែភាសាខ្មែរផ្ទាល់នៅលើអេក្រង់ (Real-time Editable)។
   - ចុចប្ដូរសំឡេងតួអង្គរវាង **♂ Piseth (ប្រុស)** និង **♀ Sreymom (ស្រី)** ដោយគ្រាន់តែចុចលើប៊ូតុងមួយឃ្លីក។
   - មានប៊ូតុង **▶** ស្តាប់សាកល្បងសំឡេងតាមជួរនីមួយៗភ្លាមៗ។
   - ចុចលើម៉ោង (Timestamp) ដើម្បីឱ្យវីដេអូ Jump ទៅកាន់ឈុតនោះភ្លាម។

5. **Audio Ducking & Synchronization**:
   - បន្ថយសំឡេងដើមនៃវីដេអូ (Ducking Slider 0% ទៅ 100%) នៅពេលសំឡេងខ្មែរនិយាយ និងដំឡើងសំឡេងភ្លេងមកវិញនៅពេលស្ងាត់។
   - Time-Stretching: តម្រឹមល្បឿននិយាយរបស់សំឡេងខ្មែរឱ្យស៊ីគ្នាជាមួយពេលវេលានៃឈុតវីដេអូ មិនឱ្យជាន់គ្នាឡើយ។

6. **មុខងារដាក់ Logo / Watermark លើវីដេអូ (Logo Branding)**:
   - អាច Upload រូបភាព Logo ផ្ទាល់ខ្លួន (PNG, JPG, WebP) ឬប្រើប្រាស់ `logo.jpg` ដែលមានស្រាប់។
   - **កែសម្រួលទីតាំង (Position)**: លើ-ស្តាំ (Top-Right), លើ-ឆ្វេង (Top-Left), ក្រោម-ស្តាំ (Bottom-Right), ក្រោម-ឆ្វេង (Bottom-Left), ឬកណ្តាល (Center)។
   - **ទំហំ និងភាពថ្លា (Size & Opacity Sliders)**: កំណត់ទំហំ Logo (5% ទៅ 45%) និងភាពថ្លា (10% ទៅ 100%) បានយ៉ាងងាយស្រួល។
   - **បង្ហាញលើ Video Player ផ្ទាល់**: Logo នឹងបង្ហាញអណ្តែតលើវីដេអូក្នុងកម្មវិធីភ្លាមៗតាមការកំណត់។
   - **Watermark ជាប់លើវីដេអូពេល Export**: ពេលចុច **🎞 Export dubbed video** ប្រព័ន្ធនឹងដំណើរការ FFmpeg (ឬ Browser Canvas) ដើម្បី Burn Logo ឱ្យជាប់ជាស្ថាពរលើផ្ទាំងវីដេអូនោះតែម្តង!

7. **ជម្រើស Export ច្រើនបែប**:
   - **🎞 Export Dubbed Video**: បញ្ចូលសំឡេងខ្មែរ + Logo Watermark ទៅជា File MP4 / WebM។
   - **⬇ Audio**: ទាញយកតែ File សំឡេងខ្មែរទាំងស្រុង (.wav)។
   - **⬇ .srt**: ទាញយក File អក្សររត់ខ្មែរ (.srt)។

---

## 🚀 របៀបប្រើប្រាស់ (Quick Start)

### វិធីទី ១: បើកផ្ទាល់លើ Browser (ងាយស្រួលបំផុត)
1. បើក Folder នេះ រួចចុចទ្វេដង (Double-click) លើ `index.html` ដើម្បីបើកក្នុង **Google Chrome** ឬ **Microsoft Edge**។
2. ចូលទៅកាន់ផ្ទាំង **Providers** រួច paste Gemini API Key របស់អ្នក (អាចយក Free ពី [Google AI Studio](https://aistudio.google.com/apikey))។
3. អូសទម្លាក់ (Drag & Drop) វីដេអូរបស់អ្នកចូលក្នុងប្រអប់ **Drop a video here**។
4. ចុចប៊ូតុង **✨ Dub to Khmer**!

---

### វិធីទី ២: ដំណើរការជាមួយ Python Local Server (ណែនាំសម្រាប់ Export លឿន)
បើក Terminal / PowerShell ក្នុង Folder នេះ រួចវាយ៖
```bash
python server.py
```
បន្ទាប់មកបើក Browser ចូលទៅកាន់: `http://localhost:8000`

---

## ⚙️ ការកំណត់សំឡេង (Voice Settings)

| សំឡេង | កូដ Voice | ការពិពណ៌នា |
|---|---|---|
| ♂ **Piseth** | `km-KH-PisethNeural` | សំឡេងបុរសខ្មែរ ធម្មជាតិ ច្បាស់ និងទន់ភ្លន់ |
| ♀ **Sreymom** | `km-KH-SreymomNeural` | សំឡេងស្ត្រីខ្មែរ រស់រវើក ពិរោះ ស្រទន់ |

---

## 📁 រចនាសម្ព័ន្ធឯកសារ (Project Structure)

```text
├── index.html        # ទំព័រដើមកម្មវិធី (Modern Responsive UI)
├── style.css         # Styling ដ៏ស្រស់ស្អាត (Dark Theme, Neon Aurora, Controls)
├── app.js            # កូដ JavaScript ចម្បង (Gemini API, Web Audio, Edge TTS, MediaBunny Remux)
├── server.py         # Local Python Companion Server (Web Server + TTS Proxy)
├── icon.png          # រូបតំណាងកម្មវិធី (App Icon)
├── logo.jpg          # Logo កម្មវិធី
└── README.md         # ឯកសារណែនាំការប្រើប្រាស់
```
