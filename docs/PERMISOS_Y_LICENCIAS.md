# Permisos, privacidad, dependencias y licencias

## Permisos

| Permiso | Para qué | ¿Obligatorio? |
|---|---|---|
| `INTERNET` | Descargar el tiempo y buscar ciudades | Sí |
| `ACCESS_NETWORK_STATE` | Que WorkManager espere a tener red | Sí (normal, sin diálogo) |
| `ACCESS_COARSE_LOCATION` | «Usar mi ubicación» | No: solo si el usuario lo elige; se puede usar Aura solo con ciudades manuales |

| `SET_WALLPAPER` | Aura Studio: aplicar el fondo creado | Normal (sin diálogo) |
| `WRITE_EXTERNAL_STORAGE` (solo Android 8–9) | Guardar el fondo en la Galería | Solo en versiones antiguas; desde Android 10, MediaStore sin permiso |

Las fotos se eligen con el selector oficial del sistema: Aura no pide acceso a la galería y nunca transmite imágenes.

No se piden ubicación precisa, ubicación en segundo plano, almacenamiento, notificaciones ni contactos. La ubicación se lee solo con la app en primer plano, una vez, y se redondea a 0,01° (~1 km) antes de guardarse o enviarse.

## Datos

- Todo se guarda en el teléfono (DataStore). No hay cuentas, analítica ni anuncios.
- Se envían a Open-Meteo solo las coordenadas del lugar consultado (4 decimales para ciudades elegidas, 2 para la ubicación del dispositivo) y, al buscar, el texto de búsqueda.
- La copia de seguridad de Android incluye ajustes y perfiles, no la caché meteorológica.
- Ajustes › Privacidad › «Borrar todos los datos de Aura».

## Fuente meteorológica

**Open-Meteo** (`api.open-meteo.com`, `geocoding-api.open-meteo.com`): sin clave API, gratuito para uso no comercial (≈10 000 llamadas/día), datos bajo **CC BY 4.0**: la atribución se muestra en Inicio, Pronóstico y Ajustes. La búsqueda usa datos de GeoNames (CC BY 4.0). Para uso comercial Open-Meteo exige un plan de pago: la capa de datos (`WeatherProvider`/`PlaceSearchProvider` en `:core`) permite sustituirlo, por ejemplo por MET Norway.

## Dependencias (todas Apache 2.0)

Kotlin 2.1.0, kotlinx-coroutines 1.9.0, kotlinx-serialization 1.7.3, AndroidX Core 1.15.0, Activity Compose 1.9.3, Compose BOM 2024.12.01 (Material 3), Lifecycle 2.8.7, Navigation Compose 2.8.5, DataStore 1.1.1, WorkManager 2.10.0. Compilación: Android Gradle Plugin 8.7.3, Gradle 8.14.3. Pruebas: JUnit 4.13.2, AndroidX Test.

La ubicación va por `LocationManager` y el nombre del lugar por `Geocoder` del sistema. Google Play Services solo se usa para la segmentación local de Aura Studio (ML Kit Subject Segmentation, gratuita, en el dispositivo: `com.google.android.gms:play-services-mlkit-subject-segmentation`, términos de ML Kit). Sin Play Services, Studio funciona en modo manual.

Iconos, icono de marca y layouts: diseño propio de este repositorio.
