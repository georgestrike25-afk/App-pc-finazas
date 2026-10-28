// Permite compilar y probar el módulo :core de forma aislada (sin Android SDK):
//   gradle -p core test
// Dentro del build principal este archivo se ignora.
pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories { mavenCentral() }
    versionCatalogs {
        create("libs") { from(files("../gradle/libs.versions.toml")) }
    }
}

rootProject.name = "aura-core"
