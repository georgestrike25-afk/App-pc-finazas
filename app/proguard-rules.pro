# kotlinx.serialization incluye sus propias reglas de consumo; se conservan además los modelos
# persistidos para que los nombres de campo del JSON en DataStore no cambien entre versiones.
-keep,includedescriptorclasses class app.aura.core.**$$serializer { *; }
-keepclassmembers class app.aura.core.** {
    *** Companion;
}
-keepclasseswithmembers class app.aura.core.** {
    kotlinx.serialization.KSerializer serializer(...);
}
