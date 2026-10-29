package app.aura.studio.wallpaper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Color
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import androidx.core.content.ContextCompat
import app.aura.aura
import app.aura.core.studio.StudioProject
import app.aura.studio.mask.MaskRenderer
import app.aura.studio.render.ClockExtrasBuilder
import app.aura.studio.render.Backdrop
import app.aura.studio.render.ClockPainter
import app.aura.studio.render.StudioCompositor
import app.aura.studio.render.StudioFonts
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDateTime

/**
 * Fondo animado de Aura Studio: la hora del diseño activo en tiempo real.
 *
 * Consumo: no hay bucle de animación. Se redibuja una vez por minuto, en el cambio exacto de minuto
 * del reloj del sistema (temporizador propio alineado + ACTION_TIME_TICK como respaldo, porque
 * algunos fabricantes retrasan esa difusión), al cambiar hora/zona horaria y al volver a verse.
 * Mientras el fondo no se ve, no se procesa nada. La foto y la capa del
 * sujeto se componen una vez y se reutilizan; cada minuto solo se pinta el reloj.
 */
class AuraWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = AuraEngine()

    inner class AuraEngine : Engine() {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        private val lock = Mutex()
        private val compositor = StudioCompositor(ClockPainter(StudioFonts.resolver(this@AuraWallpaperService)))
        private var project: StudioProject? = null
        private var background: Bitmap? = null
        private var subject: Bitmap? = null
        private var width = 0
        private var height = 0
        private var registered = false
        private val handler = android.os.Handler(android.os.Looper.getMainLooper())

        /** Programa el próximo redibujado justo después del cambio de minuto del sistema. */
        private val minuteTick = object : Runnable {
            override fun run() {
                redraw(reload = false)
                scheduleNextMinute()
            }
        }

        private fun scheduleNextMinute() {
            handler.removeCallbacks(minuteTick)
            val now = System.currentTimeMillis()
            handler.postDelayed(minuteTick, MINUTE - now % MINUTE + 40)
        }

        private val ticker = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                redraw(reload = intent.action != Intent.ACTION_TIME_TICK)
            }
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {
            super.onSurfaceChanged(holder, format, w, h)
            width = w
            height = h
            redraw(reload = true)
        }

        override fun onVisibilityChanged(visible: Boolean) {
            if (visible) {
                register()
                scheduleNextMinute()
                // Al volver a verse se comprueba si el diseño activo cambió desde Aura Studio.
                redraw(reload = true)
            } else {
                handler.removeCallbacks(minuteTick)
                unregister()
            }
        }

        override fun onDestroy() {
            handler.removeCallbacks(minuteTick)
            unregister()
            scope.cancel()
            background?.recycle()
            subject?.recycle()
            super.onDestroy()
        }

        private fun register() {
            if (registered) return
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_TIME_TICK)
                addAction(Intent.ACTION_TIME_CHANGED)
                addAction(Intent.ACTION_TIMEZONE_CHANGED)
            }
            ContextCompat.registerReceiver(this@AuraWallpaperService, ticker, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
            registered = true
        }

        private fun unregister() {
            if (!registered) return
            runCatching { unregisterReceiver(ticker) }
            registered = false
        }

        private fun redraw(reload: Boolean) {
            if (width <= 0 || height <= 0) return
            scope.launch {
                lock.withLock {
                    val app = applicationContext.aura
                    if (reload) loadLayers(app)
                    val holder = surfaceHolder
                    val canvas = runCatching { holder.lockCanvas() }.getOrNull() ?: return@withLock
                    try {
                        val p = project
                        val bg = background
                        if (p == null || bg == null) {
                            canvas.drawColor(EMPTY_COLOR)
                        } else {
                            canvas.drawBitmap(bg, 0f, 0f, null)
                            val extras = ClockExtrasBuilder.build(
                                applicationContext, p.design, app.settings.current(), app.weather.cached(), LocalDateTime.now(),
                            )
                            compositor.clock.draw(canvas, width, height, p.design, extras, Backdrop(bg, android.graphics.Matrix()))
                            subject?.let { canvas.drawBitmap(it, 0f, 0f, null) }
                        }
                    } finally {
                        runCatching { holder.unlockCanvasAndPost(canvas) }
                    }
                }
            }
        }

        private suspend fun loadLayers(app: app.aura.AppContainer) {
            val repo = app.studio
            val id = repo.activeIdBlocking() ?: run { project = null; return }
            val loaded = repo.load(id) ?: run { project = null; return }
            if (loaded == project && background?.width == width && background?.height == height) return
            val photo = repo.photo(id) ?: run { project = null; return }
            val mask = if (loaded.hasMask) {
                val (mw, mh) = MaskRenderer.workingSize(photo.width, photo.height)
                MaskRenderer.render(repo.baseMask(id), loaded.strokes, mw, mh)
            } else {
                null
            }
            val bg = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            compositor.drawPhoto(android.graphics.Canvas(bg), width, height, photo, loaded)
            val subj = compositor.subjectLayer(width, height, photo, mask, loaded)
            background?.recycle()
            subject?.recycle()
            background = bg
            subject = subj
            project = loaded
            photo.recycle()
            mask?.recycle()
        }
    }

    companion object {
        private val EMPTY_COLOR = Color.rgb(0x10, 0x1D, 0x2B)
        private const val MINUTE = 60_000L
    }
}
