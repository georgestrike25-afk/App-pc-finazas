package app.aura

import android.app.WallpaperManager
import android.appwidget.AppWidgetManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextClock
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.aura.core.settings.LocationMode
import app.aura.core.style.BackgroundMode
import app.aura.core.style.Profiles
import app.aura.core.style.WidgetStyle
import app.aura.core.weather.Coordinates
import app.aura.core.weather.Place
import app.aura.core.widget.SizeClass
import app.aura.core.widget.WidgetType
import app.aura.data.RefreshResult
import app.aura.widget.WidgetRenderer
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import app.aura.core.time.DateStyle
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Infla los RemoteViews reales de cada widget (mismo mecanismo que usa el launcher) sobre fondos
 * claros y oscuros, comprueba la transparencia píxel a píxel y guarda capturas para revisión.
 */
@RunWith(AndroidJUnit4::class)
class WidgetRenderingTest {

    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val density = context.resources.displayMetrics.density

    companion object {
        val outDir: File by lazy {
            File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "aura-shots").apply { mkdirs() }
        }

        @BeforeClass
        @JvmStatic
        fun fetchRealWeather() = runBlocking {
            val app = InstrumentationRegistry.getInstrumentation().targetContext.aura
            val madrid = Place("om:3117735", "Madrid", "Madrid", "España", Coordinates(40.4165, -3.7026), "Europe/Madrid")
            app.settings.update { it.copy(locationMode = LocationMode.MANUAL, manualPlace = madrid) }
            val result = app.weather.refresh(manual = true)
            println("AURA_REFRESH_RESULT $result")
        }
    }

    private fun wallpaper(dark: Boolean, w: Int, h: Int): Bitmap {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val colors = if (dark) intArrayOf(0xFF0B1622.toInt(), 0xFF3B5E7A.toInt()) else intArrayOf(0xFFF7F4EE.toInt(), 0xFFCFDCE6.toInt())
        c.drawPaint(Paint().apply { shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(), colors[0], colors[1], Shader.TileMode.CLAMP) })
        // Franjas: si el widget fuera opaco se dejarían de ver.
        val stripe = Paint().apply { color = if (dark) 0x33FFFFFF else 0x22101D2B }
        var x = 0f
        while (x < w) { c.drawRect(x, 0f, x + 12 * density, h.toFloat(), stripe); x += 36 * density }
        return bmp
    }

    private fun inflate(type: WidgetType, size: SizeClass, style: WidgetStyle, wDp: Int, hDp: Int): Pair<View, Bitmap> = runBlocking {
        val app = context.aura
        val request = WidgetRenderer.Request(
            type, style, app.weather.cached(), app.settings.current(), System.currentTimeMillis(), 1, null,
        )
        val views = WidgetRenderer(context).renderSize(request, size)
        val w = (wDp * density).toInt()
        val h = (hDp * density).toInt()
        lateinit var view: View
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val parent = FrameLayout(context)
            view = views.apply(context, parent)
            parent.addView(view, FrameLayout.LayoutParams(w, h))
            parent.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
            parent.layout(0, 0, w, h)
        }
        val widgetOnly = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        InstrumentationRegistry.getInstrumentation().runOnMainSync { view.draw(Canvas(widgetOnly)) }
        view to widgetOnly
    }

    private fun save(name: String, widget: Bitmap) {
        val pad = (12 * density).toInt()
        val sheet = Bitmap.createBitmap(widget.width * 2 + pad * 3, widget.height + pad * 2, Bitmap.Config.ARGB_8888)
        val c = Canvas(sheet)
        c.drawColor(Color.rgb(40, 44, 48))
        listOf(true, false).forEachIndexed { i, dark ->
            val left = pad + i * (widget.width + pad)
            c.drawBitmap(wallpaper(dark, widget.width, widget.height), left.toFloat(), pad.toFloat(), null)
            c.drawBitmap(widget, left.toFloat(), pad.toFloat(), null)
        }
        File(outDir, "$name.png").outputStream().use { sheet.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun transparentFraction(bmp: Bitmap): Double {
        var transparent = 0
        val px = IntArray(bmp.width * bmp.height)
        bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        px.forEach { if (Color.alpha(it) == 0) transparent++ }
        return transparent.toDouble() / px.size
    }

    @Test
    fun weatherDataIsAvailableFromProvider() = runBlocking {
        val snap = context.aura.weather.cached()
        assertNotNull("Sin datos de Open-Meteo (¿red del emulador?)", snap)
        assertEquals("Madrid", snap!!.place.name)
        assertTrue(snap.data.hourly.isNotEmpty())
        assertTrue(snap.data.daily.isNotEmpty())
    }

    @Test
    fun everyWidgetAndSizeInflatesAndTransparentModeLetsWallpaperThrough() {
        val sizes = mapOf(
            WidgetType.CLOCK to listOf(SizeClass.SMALL to (160 to 86), SizeClass.MEDIUM to (320 to 96), SizeClass.LARGE to (320 to 180)),
            WidgetType.WEATHER to listOf(SizeClass.SMALL to (86 to 96), SizeClass.MEDIUM to (220 to 96), SizeClass.LARGE to (320 to 110)),
            WidgetType.DUO to listOf(SizeClass.SMALL to (170 to 100), SizeClass.MEDIUM to (320 to 100), SizeClass.LARGE to (320 to 190)),
            WidgetType.FORECAST to listOf(SizeClass.SMALL to (320 to 96), SizeClass.MEDIUM to (320 to 190), SizeClass.LARGE to (320 to 340)),
            WidgetType.NIGHT to listOf(SizeClass.SMALL to (170 to 96), SizeClass.MEDIUM to (320 to 96), SizeClass.LARGE to (320 to 190)),
        )
        sizes.forEach { (type, list) ->
            list.forEach { (size, dims) ->
                val (view, bmp) = inflate(type, size, Profiles.MINIMAL, dims.first, dims.second)
                save("minimal_${type.name.lowercase()}_${size.name.lowercase()}", bmp)
                assertEquals(View.GONE, view.findViewById<ImageView>(R.id.w_bg).visibility)
                // Transparente: la mayor parte del área no tiene ningún píxel pintado.
                val fraction = transparentFraction(bmp)
                assertTrue("$type $size: solo ${"%.2f".format(fraction)} transparente", fraction > 0.5)
                // Forecast pequeño prioriza el clima: no incluye la hora por diseño.
                if (type.showsClock && !(type == WidgetType.FORECAST && size == SizeClass.SMALL)) {
                    val clock = view.findViewById<TextClock>(R.id.w_time)
                    assertNotNull("$type $size sin reloj", clock)
                    assertTrue("$type $size sin hora", clock.text.isNotBlank())
                }
                if (type.showsWeather) {
                    val temp = view.findViewById<TextView>(R.id.w_temp)
                    assertTrue("$type $size sin temperatura real: ${temp.text}", temp.text.matches(Regex("-?\\d+°")))
                }
            }
        }
    }

    @Test
    fun weatherWidgetShowsTodaysDate() {
        listOf(SizeClass.MEDIUM to (220 to 96), SizeClass.LARGE to (360 to 110)).forEach { (size, d) ->
            val (view, bmp) = inflate(WidgetType.WEATHER, size, Profiles.MINIMAL, d.first, d.second)
            save("weather_date_${size.name.lowercase()}", bmp)
            val date = view.findViewById<TextClock>(R.id.w_date)
            assertNotNull("Weather $size sin fecha", date)
            assertEquals(View.VISIBLE, date.visibility)
            assertTrue("Weather $size: fecha vacía", date.text.isNotBlank())
            val (hidden, _) = inflate(WidgetType.WEATHER, size, Profiles.MINIMAL.copy(showDate = false), d.first, d.second)
            assertEquals(View.GONE, hidden.findViewById<TextClock>(R.id.w_date).visibility)
        }
    }

    @Test
    fun numericDateFormatShowsDayMonthYear() {
        val today = java.time.LocalDate.now()
        val numeric = "%02d/%02d/%04d".format(today.dayOfMonth, today.monthValue, today.year)
        listOf(
            Triple(WidgetType.WEATHER, SizeClass.MEDIUM, 220 to 96),
            Triple(WidgetType.WEATHER, SizeClass.LARGE, 360 to 110),
            Triple(WidgetType.CLOCK, SizeClass.MEDIUM, 220 to 96),
            Triple(WidgetType.DUO, SizeClass.MEDIUM, 360 to 100),
        ).forEach { (type, size, d) ->
            listOf(DateStyle.NUMERIC, DateStyle.WEEKDAY_NUMERIC).forEach { ds ->
                val (view, bmp) = inflate(type, size, Profiles.MINIMAL.copy(dateStyle = ds), d.first, d.second)
                save("date_${ds.name.lowercase()}_${type.name.lowercase()}_${size.name.lowercase()}", bmp)
                val text = view.findViewById<TextClock>(R.id.w_date).text.toString()
                assertTrue("$type $size $ds: «$text» no tiene dd/mm/aaaa", text.endsWith(numeric))
                if (ds == DateStyle.WEEKDAY_NUMERIC) assertTrue("$type $size: falta el día «$text»", text.length > numeric.length)
            }
        }
    }

    @Test
    fun tomorrowForecastIsShownWhereThereIsRoom() {
        listOf(
            Triple(WidgetType.FORECAST, SizeClass.MEDIUM, 320 to 190),
            Triple(WidgetType.DUO, SizeClass.MEDIUM, 360 to 100),
            Triple(WidgetType.DUO, SizeClass.LARGE, 360 to 190),
            Triple(WidgetType.WEATHER, SizeClass.LARGE, 360 to 110),
        ).forEach { (type, size, d) ->
            val (view, bmp) = inflate(type, size, Profiles.MINIMAL, d.first, d.second)
            save("tomorrow_${type.name.lowercase()}_${size.name.lowercase()}", bmp)
            val block = view.findViewById<View>(R.id.w_tomorrow)
            assertEquals("$type $size sin bloque de mañana", View.VISIBLE, block.visibility)
            val range = view.findViewById<TextView>(R.id.w_tomorrow_range).text.toString()
            assertTrue("$type $size: rango de mañana inválido «$range»", range.matches(Regex("-?\\d+° / -?\\d+°")))
            val (hidden, _) = inflate(type, size, Profiles.MINIMAL.copy(showTomorrow = false), d.first, d.second)
            assertEquals(View.GONE, hidden.findViewById<View>(R.id.w_tomorrow).visibility)
        }
    }

    @Test
    fun opacityControlsPanelAlphaAcrossTheFullRange() {
        listOf(0, 25, 50, 75, 100).forEach { opacity ->
            val style = WidgetStyle(background = BackgroundMode.DARK, opacity = opacity)
            val (view, bmp) = inflate(WidgetType.DUO, SizeClass.MEDIUM, style, 320, 100)
            save("opacity_dark_$opacity", bmp)
            val bg = view.findViewById<ImageView>(R.id.w_bg)
            if (opacity == 0) {
                assertEquals(View.GONE, bg.visibility)
            } else {
                assertEquals(View.VISIBLE, bg.visibility)
                assertEquals((opacity * 255 / 100.0).let { Math.round(it).toInt() }, bg.imageAlpha)
                // Píxel de esquina interior (fuera del texto): alfa del panel.
                val alpha = Color.alpha(bmp.getPixel((6 * density).toInt(), bmp.height - (14 * density).toInt()))
                assertTrue("opacidad $opacity -> alfa $alpha", kotlin.math.abs(alpha - bg.imageAlpha) <= 3)
            }
        }
    }

    @Test
    fun profilesRender() {
        mapOf("glass" to Profiles.GLASS, "dark" to Profiles.DARK, "light" to Profiles.LIGHT, "custom" to Profiles.CUSTOM).forEach { (name, style) ->
            listOf(WidgetType.DUO to (320 to 190), WidgetType.FORECAST to (320 to 340)).forEach { (type, d) ->
                val (_, bmp) = inflate(type, SizeClass.LARGE, style, d.first, d.second)
                save("profile_${name}_${type.name.lowercase()}", bmp)
            }
        }
    }

    @Test
    fun skyProfileShowsWeatherSceneRealisticIconsAndBoldHours() {
        listOf(WidgetType.DUO to (320 to 190), WidgetType.WEATHER to (320 to 110), WidgetType.FORECAST to (320 to 340), WidgetType.CLOCK to (320 to 180)).forEach { (type, d) ->
            val (view, bmp) = inflate(type, SizeClass.LARGE, Profiles.SKY, d.first, d.second)
            save("sky_${type.name.lowercase()}", bmp)
            assertEquals(View.VISIBLE, view.findViewById<ImageView>(R.id.w_scene).visibility)
            if (type.showsClock) {
                assertEquals(View.GONE, view.findViewById<TextClock>(R.id.w_time).visibility)
                assertEquals(View.VISIBLE, view.findViewById<TextClock>(R.id.w_time_h).visibility)
            }
            if (type.showsWeather) {
                assertEquals(View.VISIBLE, view.findViewById<ImageView>(R.id.w_icon_3d).visibility)
                assertEquals(View.GONE, view.findViewById<ImageView>(R.id.w_icon_base).visibility)
            }
        }
        // Iconos 3D sin fondo (transparente), como alternativa a la escena.
        val (_, bmp) = inflate(WidgetType.DUO, SizeClass.LARGE, Profiles.SKY.copy(background = BackgroundMode.TRANSPARENT, opacity = 0), 320, 190)
        save("sky_transparent_duo", bmp)
        assertTrue(transparentFraction(bmp) > 0.5)
    }

    @Test
    fun providersAreRegistered() {
        val providers = AppWidgetManager.getInstance(context).installedProviders.filter { it.provider.packageName == context.packageName }
        assertEquals(5, providers.size)
        assertTrue(providers.all { it.configure != null })
    }

    @Test
    fun setLightAndDarkWallpapersForLauncherShots() {
        // Deja preparado un fondo para las capturas del launcher que hace el workflow.
        val wm = WallpaperManager.getInstance(context)
        val dm = context.resources.displayMetrics
        wm.setBitmap(wallpaper(dark = false, dm.widthPixels, dm.heightPixels))
        File(outDir, "wallpaper_light.png").outputStream().use { wallpaper(false, 200, 400).compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue(true)
    }

    @Test
    fun refreshResultIsReported() = runBlocking {
        val r = context.aura.weather.refresh(manual = false)
        assertTrue(r is RefreshResult.NotNeeded || r is RefreshResult.Updated)
    }
}
