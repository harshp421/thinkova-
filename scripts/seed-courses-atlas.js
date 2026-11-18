/**
 * ThinkOva — MongoDB Atlas Course & Track Seeder
 * Populates 'thinkova_schools.tracks' and 'thinkova_schools.courses' collections
 * directly from src/data/tracks.ts with proper indexing and idempotency.
 * 
 * Usage:
 *   node scripts/seed-courses-atlas.js
 */

const { MongoClient } = require("mongodb");
const path = require("path");
const fs = require("fs");

// Load environment variables from .env / .env.local
function loadEnv() {
  const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1].trim()] = v;
    }
  });
  return env;
}

const env = loadEnv();
const uri = process.env.SCHOOLS_DATABASE_URL || env.SCHOOLS_DATABASE_URL;

if (!uri) {
  console.error("Error: Missing SCHOOLS_DATABASE_URL. Please define it in .env.local.");
  process.exit(1);
}

// Comprehensive Catalog Data matching src/data/tracks.ts
const tracks = [
  {
    id: "robotics",
    name: "Robotics",
    slug: "robotics",
    filterLabel: "Robotics",
    tagline: "Build, code, and control physical intelligent robots.",
    description: "Hands-on engineering where hardware meets intelligence. Students assemble mechanical robots, wire sensors, and program autonomy.",
    priceRange: "₹4,999 - ₹8,999",
    minPrice: 4999,
    gradeRange: "Grades 5-8",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=800",
    status: "ACTIVE",
    updatedAt: new Date(),
  },
  {
    id: "electronics",
    name: "Electronics & IoT",
    slug: "electronics",
    filterLabel: "Electronics",
    tagline: "Master circuits, sensors, and cloud-connected hardware.",
    description: "From breadboards and microcontrollers to cloud IoT dashboards. Understand the electrical foundations of modern technology.",
    priceRange: "₹4,999 - ₹7,999",
    minPrice: 4999,
    gradeRange: "Grades 6-8",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800",
    status: "ACTIVE",
    updatedAt: new Date(),
  },
  {
    id: "ai",
    name: "AI & Machine Learning",
    slug: "ai",
    filterLabel: "AI & ML",
    tagline: "Train computer vision models and neural networks from scratch.",
    description: "Demystify AI beyond consumer chatbots. Students train custom vision, speech, and recommendation models using Python.",
    priceRange: "₹5,499 - ₹9,499",
    minPrice: 5499,
    gradeRange: "Grades 6-8",
    image: "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&q=80&w=800",
    status: "ACTIVE",
    updatedAt: new Date(),
  },
  {
    id: "games",
    name: "Game Development",
    slug: "games",
    filterLabel: "Game Dev",
    tagline: "Design, code, and publish 2D/3D physics-driven games.",
    description: "Turn gaming screen-time into software engineering skill. Build arcade games, platformers, and multiplayer experiences.",
    priceRange: "₹4,499 - ₹6,999",
    minPrice: 4499,
    gradeRange: "Grades 5-7",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800",
    status: "ACTIVE",
    updatedAt: new Date(),
  },
  {
    id: "design",
    name: "3D Design & CAD",
    slug: "design",
    filterLabel: "3D Design",
    tagline: "Model spatial objects, digital twins, and 3D printable gears.",
    description: "Transform imagination into precision spatial engineering. Design mechanical parts, test stress points, and prepare 3D print assets.",
    priceRange: "₹4,499 - ₹6,999",
    minPrice: 4499,
    gradeRange: "Grades 5-8",
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=800",
    status: "ACTIVE",
    updatedAt: new Date(),
  },
];

const courses = [
  {
    id: "robotics-starter",
    title: "Autonomous Obstacle-Navigating Rover",
    trackId: "robotics",
    trackName: "Robotics",
    grades: "Grades 5–6",
    minGrade: 5,
    maxGrade: 6,
    targetGrades: [5, 6],
    duration: "8 Weeks (2 hrs/wk in School Lab)",
    price: 4999,
    priceFormatted: "₹4,999",
    twoPartsPriceFormatted: "₹2,500 + ₹2,499",
    firstPartFormatted: "₹2,500",
    secondPartFormatted: "₹2,499",
    nextBatch: "Starts 20th Nov 2026",
    summary: "Build an ultrasonic smart rover that maps obstacles in real time and navigates maze environments without collision.",
    whatTheyBuild: "A dual-motor obstacle avoidance rover with ultrasonic sonar, custom chassis, and autonomous PID logic.",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=800",
    heroImage: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=1200",
    popularTag: "Most Popular in Pune",
    kitIncluded: true,
    classSchedule: "Wednesdays 2:30 PM - 4:30 PM",
    location: "In School Computer Lab",
    seatsLeft: 7,
    demoDayPromise: "100% money-back guarantee if your child does not demo their working robot live on Demo Day.",
    demoDayTests: [
      "Maze navigation without manual intervention",
      "Dynamic obstacle detection at 15cm distance",
      "Parent Q&A on sensor schematics",
    ],
    tutor: {
      name: "Er. Rohit Kulkarni",
      title: "Robotics Lead & Mechatronics Specialist",
      bio: "8+ years mentoring school students for national robotics olympiads and maker faires.",
    },
    weeklyPlan: [
      { week: 1, title: "Hardware Architecture & Circuit Foundations", subtitle: "Assembling the dual-chassis, motor drivers, and understanding DC voltage regulation." },
      { week: 2, title: "Microcontroller Setup & Motor Actuation", subtitle: "Writing pulse-width modulation (PWM) routines to control rover speed and differential steering." },
      { week: 3, title: "Ultrasonic Sonar & Distance Sensing", subtitle: "Wiring HC-SR04 sonar sensors and computing echo-timing distance in centimeters." },
      { week: 4, title: "Obstacle Avoidance Logic & Level 4 Checkpoint", subtitle: "Writing reactive collision prevention algorithms; 1st installment milestone review." },
      { week: 5, title: "Speed Optimization & PID Control", subtitle: "Smoothing wheel jitter with proportional controller feedback; unlocking Level 5." },
      { week: 6, title: "Maze Solving & Edge Cases", subtitle: "Programming right-hand wall-follower algorithms for maze exit detection." },
      { week: 7, title: "Chassis Armor & Demo Rehearsal", subtitle: "Stress-testing sensor mounts, battery management, and presentation practice." },
      { week: 8, title: "Parent Demo Day & Live Certification", subtitle: "Live obstacle arena run in front of parents, school principal, and certification award." },
    ],
    status: "ACTIVE",
    updatedAt: new Date(),
  },
  {
    id: "ai-vision",
    title: "Computer Vision & Smart Camera AI",
    trackId: "ai",
    trackName: "AI & Machine Learning",
    grades: "Grades 6–8",
    minGrade: 6,
    maxGrade: 8,
    targetGrades: [6, 7, 8],
    duration: "8 Weeks (2 hrs/wk in School Lab)",
    price: 5499,
    priceFormatted: "₹5,499",
    twoPartsPriceFormatted: "₹2,750 + ₹2,749",
    firstPartFormatted: "₹2,750",
    secondPartFormatted: "₹2,749",
    nextBatch: "Starts 22nd Nov 2026",
    summary: "Train real-time neural network models to recognize hand gestures, facial expressions, and security badges.",
    whatTheyBuild: "An edge AI camera system that unlocks a digital vault when recognizing the student's face.",
    image: "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&q=80&w=800",
    heroImage: "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&q=80&w=1200",
    popularTag: "High Demand",
    kitIncluded: true,
    classSchedule: "Thursdays 3:00 PM - 5:00 PM",
    location: "In School Computer Lab",
    seatsLeft: 5,
    demoDayPromise: "100% money-back guarantee if your child does not deploy and demonstrate their AI model live.",
    status: "ACTIVE",
    updatedAt: new Date(),
  },
  {
    id: "iot-home",
    title: "Smart Home Automation with ESP32",
    trackId: "electronics",
    trackName: "Electronics & IoT",
    grades: "Grades 6–8",
    minGrade: 6,
    maxGrade: 8,
    targetGrades: [6, 7, 8],
    duration: "8 Weeks (2 hrs/wk in School Lab)",
    price: 4999,
    priceFormatted: "₹4,999",
    twoPartsPriceFormatted: "₹2,500 + ₹2,499",
    firstPartFormatted: "₹2,500",
    secondPartFormatted: "₹2,499",
    nextBatch: "Starts 25th Nov 2026",
    summary: "Connect appliances and environmental sensors to Wi-Fi and control them via an interactive cloud dashboard.",
    whatTheyBuild: "A real-time weather and automated relay security node accessible from any parent smartphone.",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800",
    heroImage: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200",
    kitIncluded: true,
    classSchedule: "Fridays 2:30 PM - 4:30 PM",
    location: "In School Computer Lab",
    seatsLeft: 8,
    demoDayPromise: "100% money-back guarantee if the smart hardware fails live demonstration.",
    status: "ACTIVE",
    updatedAt: new Date(),
  },
];

async function seed() {
  console.log("--------------------------------------------------");
  console.log("ThinkOva MongoDB Atlas Seeder — Tracks & Courses");
  console.log("--------------------------------------------------");
  console.log(`Connecting to: ${uri.slice(0, 35)}...`);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    console.log(" Connected to MongoDB Atlas cluster.");

    const db = client.db("thinkova_schools");

    // 1. Ensure Indexes on Tracks
    console.log("\n1. Ensuring Indexes on 'tracks'...");
    try {
      await db.collection("tracks").createIndex({ id: 1 });
      await db.collection("tracks").createIndex({ slug: 1 });
    } catch (idxErr) {
      console.warn("Index note on tracks:", idxErr.message);
    }

    // 2. Upsert Tracks
    console.log("2. Upserting Tracks...");
    for (const track of tracks) {
      await db.collection("tracks").updateOne(
        { id: track.id },
        { $set: track },
        { upsert: true }
      );
      console.log(`   Track: [${track.id}] ${track.name}`);
    }

    // 3. Ensure Indexes on Courses
    console.log("\n3. Ensuring Indexes on 'courses'...");
    try {
      await db.collection("courses").createIndex({ id: 1 });
      await db.collection("courses").createIndex({ trackId: 1 });
      await db.collection("courses").createIndex({ targetGrades: 1 });
    } catch (idxErr) {
      console.warn("Index note on courses:", idxErr.message);
    }

    // 4. Upsert Courses
    console.log("4. Upserting Courses...");
    for (const course of courses) {
      await db.collection("courses").updateOne(
        { id: course.id },
        { $set: course },
        { upsert: true }
      );
      console.log(`   Course: [${course.id}] ${course.title} (${course.grades})`);
    }

    const trackCount = await db.collection("tracks").countDocuments();
    const courseCount = await db.collection("courses").countDocuments();

    console.log("\n--------------------------------------------------");
    console.log(` Seeding Complete!`);
    console.log(`   Total Tracks in Atlas: ${trackCount}`);
    console.log(`   Total Courses in Atlas: ${courseCount}`);
    console.log("--------------------------------------------------");
  } catch (err) {
    console.error("❌ Seeding Error:", err);
  } finally {
    await client.close();
    console.log("Closed connection to MongoDB Atlas.");
  }
}

seed();
