package app.aura.core.widget

import app.aura.core.style.ProfileId

enum class WidgetType(val displayName: String, val defaultProfile: ProfileId, val showsClock: Boolean, val showsWeather: Boolean) {
    CLOCK("Aura Clock", ProfileId.MINIMAL, showsClock = true, showsWeather = false),
    WEATHER("Aura Weather", ProfileId.MINIMAL, showsClock = false, showsWeather = true),
    DUO("Aura Duo", ProfileId.MINIMAL, showsClock = true, showsWeather = true),
    FORECAST("Aura Forecast", ProfileId.GLASS, showsClock = true, showsWeather = true),
    NIGHT("Aura Night", ProfileId.MINIMAL, showsClock = true, showsWeather = true),
}

enum class SizeClass { SMALL, MEDIUM, LARGE }

/** Punto mínimo (dp) a partir del cual se usa una composición. */
data class Breakpoint(val sizeClass: SizeClass, val minWidthDp: Int, val minHeightDp: Int)

/**
 * Cada tamaño de widget tiene una composición propia: no se comprimen todos los elementos en
 * celdas pequeñas. Referencia: cuadrícula 4×5/5×5 de One UI en un Galaxy S24+ (celda ≈ 80×95 dp).
 */
object WidgetSizing {
    fun breakpoints(type: WidgetType): List<Breakpoint> = when (type) {
        WidgetType.CLOCK -> listOf(bp(SizeClass.SMALL, 40, 40), bp(SizeClass.MEDIUM, 160, 40), bp(SizeClass.LARGE, 180, 100))
        WidgetType.WEATHER -> listOf(bp(SizeClass.SMALL, 40, 40), bp(SizeClass.MEDIUM, 140, 40), bp(SizeClass.LARGE, 220, 40))
        WidgetType.DUO -> listOf(bp(SizeClass.SMALL, 100, 40), bp(SizeClass.MEDIUM, 220, 40), bp(SizeClass.LARGE, 220, 140))
        WidgetType.FORECAST -> listOf(bp(SizeClass.SMALL, 160, 40), bp(SizeClass.MEDIUM, 200, 120), bp(SizeClass.LARGE, 200, 230))
        WidgetType.NIGHT -> listOf(bp(SizeClass.SMALL, 100, 40), bp(SizeClass.MEDIUM, 200, 40), bp(SizeClass.LARGE, 200, 140))
    }

    /** La composición más grande cuyo mínimo cabe en el tamaño dado; si ninguna cabe, la menor. */
    fun classify(type: WidgetType, widthDp: Int, heightDp: Int): SizeClass {
        val fitting = breakpoints(type).filter { widthDp >= it.minWidthDp && heightDp >= it.minHeightDp }
        return fitting.lastOrNull()?.sizeClass ?: SizeClass.SMALL
    }

    private fun bp(c: SizeClass, w: Int, h: Int) = Breakpoint(c, w, h)

    /** Base tipográfica (sp) de la hora y la temperatura por composición; luego se aplica la escala del estilo. */
    fun heroSizes(type: WidgetType, size: SizeClass): Hero = when (type) {
        WidgetType.CLOCK -> when (size) {
            SizeClass.SMALL -> Hero(time = 44, temperature = 0)
            SizeClass.MEDIUM -> Hero(time = 58, temperature = 0)
            SizeClass.LARGE -> Hero(time = 84, temperature = 0)
        }
        WidgetType.WEATHER -> when (size) {
            SizeClass.SMALL -> Hero(time = 0, temperature = 30)
            SizeClass.MEDIUM -> Hero(time = 0, temperature = 38)
            SizeClass.LARGE -> Hero(time = 0, temperature = 52)
        }
        WidgetType.DUO -> when (size) {
            SizeClass.SMALL -> Hero(time = 44, temperature = 18)
            SizeClass.MEDIUM -> Hero(time = 56, temperature = 30)
            SizeClass.LARGE -> Hero(time = 76, temperature = 32)
        }
        WidgetType.FORECAST -> when (size) {
            SizeClass.SMALL -> Hero(time = 0, temperature = 34)
            SizeClass.MEDIUM -> Hero(time = 44, temperature = 30)
            SizeClass.LARGE -> Hero(time = 52, temperature = 34)
        }
        WidgetType.NIGHT -> when (size) {
            SizeClass.SMALL -> Hero(time = 40, temperature = 16)
            SizeClass.MEDIUM -> Hero(time = 56, temperature = 20)
            SizeClass.LARGE -> Hero(time = 80, temperature = 22)
        }
    }

    fun scaled(baseSp: Int, scalePercent: Int): Float = baseSp * scalePercent / 100f

    /** Número de columnas horarias y filas diarias que muestra Aura Forecast. */
    fun forecastSlots(size: SizeClass): Pair<Int, Int> = when (size) {
        SizeClass.SMALL -> 3 to 0
        SizeClass.MEDIUM -> 5 to 0
        SizeClass.LARGE -> 6 to 5
    }

    data class Hero(val time: Int, val temperature: Int)
}
