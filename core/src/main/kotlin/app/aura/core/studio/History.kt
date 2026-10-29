package app.aura.core.studio

/**
 * Historial de deshacer/rehacer con límite. Inmutable desde fuera: cada cambio crea un estado nuevo,
 * lo que encaja con el estado de Compose.
 */
class History<T> private constructor(
    private val past: List<T>,
    val current: T,
    private val future: List<T>,
    private val limit: Int,
) {
    constructor(initial: T, limit: Int = 60) : this(emptyList(), initial, emptyList(), limit)

    val canUndo: Boolean get() = past.isNotEmpty()
    val canRedo: Boolean get() = future.isNotEmpty()

    fun push(value: T): History<T> =
        if (value == current) this else History((past + current).takeLast(limit), value, emptyList(), limit)

    /** Reemplaza el estado actual sin crear un paso (p. ej. mientras se arrastra un control). */
    fun replace(value: T): History<T> = History(past, value, future, limit)

    fun undo(): History<T> = if (!canUndo) this else History(past.dropLast(1), past.last(), listOf(current) + future, limit)

    fun redo(): History<T> = if (!canRedo) this else History(past + current, future.first(), future.drop(1), limit)
}
