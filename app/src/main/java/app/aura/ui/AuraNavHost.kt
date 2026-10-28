package app.aura.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.aura.R
import app.aura.core.widget.WidgetType
import app.aura.ui.screens.CustomizeRoute
import app.aura.ui.screens.ForecastScreen
import app.aura.ui.screens.HomeScreen
import app.aura.ui.screens.LocationScreen
import app.aura.ui.screens.SettingsScreen
import app.aura.ui.screens.WidgetsScreen
import app.aura.ui.theme.Aura

object Routes {
    const val HOME = "home"
    const val FORECAST = "forecast"
    const val WIDGETS = "widgets"
    const val SETTINGS = "settings"
    const val LOCATION = "location"
    const val CUSTOMIZE = "customize/{type}?widgetId={widgetId}"

    fun customize(type: WidgetType, widgetId: Int? = null) =
        "customize/${type.name}" + (widgetId?.let { "?widgetId=$it" } ?: "")
}

private data class Tab(val route: String, val label: String, @DrawableRes val icon: Int)

private val tabs = listOf(
    Tab(Routes.HOME, "Inicio", R.drawable.ic_ui_home),
    Tab(Routes.FORECAST, "Pronóstico", R.drawable.ic_ui_forecast),
    Tab(Routes.WIDGETS, "Widgets", R.drawable.ic_ui_widgets),
    Tab(Routes.SETTINGS, "Ajustes", R.drawable.ic_ui_settings),
)

@Composable
fun AuraNavHost(viewModel: AuraViewModel, destination: String?, onDestinationConsumed: () -> Unit) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    LaunchedEffect(destination) {
        if (destination == Routes.FORECAST) nav.switchTab(Routes.FORECAST)
        if (destination != null) onDestinationConsumed()
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (tabs.any { it.route == currentRoute }) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.background, tonalElevation = 0.dp) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = { nav.switchTab(tab.route) },
                            icon = { Icon(painterResource(tab.icon), contentDescription = null) },
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.onSurface,
                                selectedTextColor = MaterialTheme.colorScheme.onSurface,
                                indicatorColor = Aura.tokens.accent.copy(alpha = 0.22f),
                                unselectedIconColor = Aura.tokens.mutedText,
                                unselectedTextColor = Aura.tokens.mutedText,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = Routes.HOME, modifier = Modifier.padding(padding)) {
            composable(Routes.HOME) {
                HomeScreen(
                    viewModel,
                    onOpenLocation = { nav.navigate(Routes.LOCATION) },
                    onOpenWidgets = { nav.switchTab(Routes.WIDGETS) },
                    onCustomize = { nav.navigate(Routes.customize(WidgetType.DUO)) },
                    onOpenForecast = { nav.switchTab(Routes.FORECAST) },
                )
            }
            composable(Routes.FORECAST) { ForecastScreen(viewModel, onOpenLocation = { nav.navigate(Routes.LOCATION) }) }
            composable(Routes.WIDGETS) {
                WidgetsScreen(viewModel, onCustomize = { type, id -> nav.navigate(Routes.customize(type, id)) })
            }
            composable(Routes.SETTINGS) { SettingsScreen(viewModel, onOpenLocation = { nav.navigate(Routes.LOCATION) }) }
            composable(Routes.LOCATION) { LocationScreen(viewModel, onBack = { nav.popBackStack() }) }
            composable(
                Routes.CUSTOMIZE,
                arguments = listOf(
                    navArgument("type") { type = NavType.StringType },
                    navArgument("widgetId") { type = NavType.IntType; defaultValue = -1 },
                ),
            ) { entry ->
                val type = runCatching { WidgetType.valueOf(entry.arguments?.getString("type").orEmpty()) }.getOrDefault(WidgetType.DUO)
                val widgetId = entry.arguments?.getInt("widgetId")?.takeIf { it >= 0 }
                CustomizeRoute(viewModel, type, widgetId, onDone = { nav.popBackStack() })
            }
        }
    }
}

private fun NavHostController.switchTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
