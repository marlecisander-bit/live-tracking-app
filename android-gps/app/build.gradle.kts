import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}

fun localValue(name: String, fallback: String = ""): String =
    (localProperties.getProperty(name) ?: fallback)
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")

// OneDrive can lock Kotlin's generated class directories while syncing. Keep
// disposable build output local so Android Studio builds and installs reliably.
val configuredBuildRoot = System.getenv("SIGHTSEEING_GPS_BUILD_DIR")
val localAppData = System.getenv("LOCALAPPDATA")
when {
    // On Windows, always keep disposable Gradle output outside OneDrive.
    // OneDrive can lock resource-merger files and make otherwise valid builds
    // fail during cleanup, even when a stale environment override is present.
    System.getProperty("os.name").startsWith("Windows", ignoreCase = true) &&
        !localAppData.isNullOrBlank() ->
        layout.buildDirectory.set(file("$localAppData/SightseeingShkodraGps/build/app"))
    !configuredBuildRoot.isNullOrBlank() ->
        layout.buildDirectory.set(file("$configuredBuildRoot/app"))
}

android {
    namespace = "com.sightseeingshkodra.gps"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.sightseeingshkodra.gps"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "GPS_ENDPOINT", "\"${localValue("gps.endpoint")}\"")
        buildConfigField("String", "GPS_DEVICE_TOKEN", "\"${localValue("gps.deviceToken")}\"")
        buildConfigField(
            "String",
            "GPS_VEHICLE_ID",
            "\"${localValue("gps.vehicleId", "sightseeing-shkodra-van-1")}\"",
        )
        buildConfigField(
            "String",
            "GPS_DEVICE_ID",
            "\"${localValue("gps.deviceId", "SS_PIXEL_9A_01")}\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file(".local-debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("com.google.android.gms:play-services-location:21.4.0")
    testImplementation("junit:junit:4.13.2")
}
