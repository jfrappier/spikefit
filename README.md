<div align="center">

  <img src="https://raw.githubusercontent.com/jfrappier/spikefit/refs/heads/main/logo.png" alt="SpikeFit Banner" width="100%">

  *A zero-dependency, progressive 30-minute daily power program for volleyball players.*

  [![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)]()
  [![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)]()
  [![Privacy First](https://img.shields.io/badge/Local_Storage-Privacy_First-4CAF50?style=for-the-badge)]()
  [![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-blue?style=for-the-badge)]()

</div>

---

> This page is set up for my own personal use. If you decide to use this, I am not liable for any injury sustained, lack of progression, etc. This is not a commerical application.

**SpikeFit** is a mobile-responsive web application designed to help players track their training. It runs completely in the browser, meaning there is no backend, no database setup, and no complex installation required. It is built to be lightweight, fast, and heavily focused on privacy.

## ✨ Core Features

* 📈 **Progressive Workout Tiers:** Automatically scales from Beginner (2 exercises per superset) to Intermediate and Advanced (3x3 supersets) based on your workout completion history.
* 🏐 **Volleyball-Specific Programming:** Features targeted core routines and swing mechanic repetitions to translate directly to on-court performance.
* 🔒 **Privacy-First Tracking:** All workout history, completion dates, and preferences are stored entirely in your device's Local Storage. No personal data is transmitted or collected.
* 🏅 **Milestone Tracking:** Includes a visual calendar and a shareable completion badge system.

## Science backed training program

[ACSM Position Stand on Progression Models in Resistance Training](https://pubmed.ncbi.nlm.nih.gov/19204579/) recommends training frequency of 2-3 days/week for novices, 3-4 days/week for intermediate trainees, and 4-5 days/week for advanced trainees. This is the model used to progress players from begginer, through advanced.

F.R.E.S.H (currently in beta) is based on Tim Gabbett's Acute:Chronic Workload Ratio framework. ACWR is a widely used sports science model for monitoring training load and reducing injury risk, and it's fundamentally about consistency of load over time for safe adaptation. 

## 🚀 Getting Started

Because SpikeFit is a static application, you do not need a package manager, build tools, or a local server to run it. 

### Local Execution

To run the app on your own machine, simply download or clone the repository and open the `index.html` file in any modern web browser. The app will immediately initialize and create the necessary local storage keys to begin tracking your progress.

### Live Hosting via GitHub Pages

The easiest way to share this application with other players is to host it via GitHub Pages. 

1. Navigate to the **Settings** tab of your repository.
2. Select **Pages** from the left-hand sidebar.
3. Under the **Build and deployment** source dropdown, select **Deploy from a branch**.
4. Select your `main` branch and click **Save**.

GitHub will provide a live URL where the application can be accessed, perfectly formatted for mobile devices.

## Authentication

The page is meant to operate indepently of any backend or external services. However, there may be reasons to gate access. An example `worker.js` is in the cloudflare directory that enables you to use `auth.html` in those scenarios. This is simply an example of how to add authentication, and not a robust solution.

## 🔄 Resetting Data

If you need to clear your progress and start the program over, you can use the "Reset Today's Progress" button for a single day, or simply clear your browser's site data/local storage to wipe the application completely clean.

---

**Disclaimer:** *This project is for educational and example purposes only. Users should always consult with a qualified healthcare provider or physician before beginning any new exercise program. The repository owner assumes no liability for injuries incurred while using this application.*
