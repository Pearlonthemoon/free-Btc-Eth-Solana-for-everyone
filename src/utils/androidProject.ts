import JSZip from 'jszip';
import type {AppConfig} from '../types';
import {validateWalletAddress} from './crypto';

export function slugifyAppName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sharedroid-app'
  );
}

export function androidZipFilename(appName: string): string {
  return `${slugifyAppName(appName)}-android-studio.zip`;
}

export async function generateAndroidStudioZip(config: AppConfig, runtimeUrl: string): Promise<Blob> {
  const zip = new JSZip();
  const safeAppName = config.appName.replace(/"/g, '') || 'ShareDroidApp';
  const safePackageId = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(config.packageId)
    ? config.packageId
    : 'com.sharedroid.app';
  const packagePath = safePackageId.replace(/\./g, '/');
  const activeWallets = config.wallets.filter(
    (w) => w.enabled && validateWalletAddress(w.chain, w.address).valid,
  );

  const payoutManifest = {
    appName: config.appName,
    packageId: safePackageId,
    version: config.version,
    downloadModel: config.downloadModel,
    downloadPriceUsd: config.downloadPriceUsd,
    runShareUsd: config.runShareUsd,
    creatorSharePercent: 50,
    participantPoolPercent: 50,
    runtimeUrl,
    wallets: activeWallets.map((w) => ({
      chain: w.chain,
      network: w.network,
      address: w.address.trim(),
      splitPercent: w.splitPercent,
    })),
  };

  zip.file(
    'settings.gradle.kts',
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${safeAppName.replace(/\s+/g, '')}"
include(":app")
`,
  );

  zip.file(
    'build.gradle.kts',
    `plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
`,
  );

  zip.file(
    'gradle.properties',
    `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
  );

  zip.file('app/proguard-rules.pro', `# Keep WebView JS bridge interfaces if added\n`);

  zip.file(
    'app/build.gradle.kts',
    `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "${safePackageId}"
    compileSdk = 34

    defaultConfig {
        applicationId = "${safePackageId}"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "${config.version.replace(/"/g, '')}"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
`,
  );

  zip.file(
    'app/src/main/AndroidManifest.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="bitcoin" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="ethereum" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="solana" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="lightning" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="litecoin" />
        </intent>
    </queries>

    <application
        android:allowBackup="true"
        android:label="${safeAppName}"
        android:supportsRtl="true"
        android:theme="@style/Theme.AppCompat.Light.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
  );

  zip.file(
    `app/src/main/java/${packagePath}/MainActivity.kt`,
    `package ${safePackageId}

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val runtimeUrl = "${runtimeUrl.replace(/"/g, '')}"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                val cryptoSchemes = listOf("bitcoin:", "lightning:", "ethereum:", "solana:", "litecoin:")
                if (cryptoSchemes.any { url.startsWith(it, ignoreCase = true) }) {
                    return try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        true
                    } catch (_: Exception) {
                        false
                    }
                }
                return false
            }
        }

        webView.loadUrl(runtimeUrl)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
`,
  );

  zip.file('app/src/main/assets/creator-payout-config.json', JSON.stringify(payoutManifest, null, 2));

  zip.file(
    'README.md',
    `# ${safeAppName} — Android Studio Build Bundle

This package wraps your configured **ShareDroid** runtime and embeds your creator BTC and multi-chain payout addresses inside \`app/src/main/assets/creator-payout-config.json\`.

## Configured Creator Payout Wallets
${
  activeWallets.length === 0
    ? '- No wallets configured yet.'
    : activeWallets
        .map((w) => `- **${w.chain}** (${w.splitPercent}% of creator share): \`${w.address}\``)
        .join('\n')
}

## How to Build the APK
1. Open this folder in **Android Studio** (Jellyfish or newer).
2. Let Gradle sync dependencies.
3. Run **Build > Build Bundle(s) / APK(s) > Build APK(s)** to produce \`app-debug.apk\` or generate a signed release APK for distribution.
4. Distribute the APK directly or host the live PWA link: \`${runtimeUrl}\`.
`,
  );

  return zip.generateAsync({type: 'blob'});
}
