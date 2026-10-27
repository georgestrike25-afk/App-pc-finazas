package com.afinador.acustico

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afinador.acustico.data.ThemeMode
import com.afinador.acustico.ui.AppRoot
import com.afinador.acustico.ui.theme.AfinadorTheme
import com.afinador.acustico.ui.theme.isDarkTheme

class MainActivity : ComponentActivity() {
    private val viewModel: TunerViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val settings by viewModel.settings.collectAsStateWithLifecycle()
            val dark = isDarkTheme(settings?.themeMode ?: ThemeMode.SYSTEM)
            LaunchedEffect(dark) {
                val style = if (dark) {
                    SystemBarStyle.dark(Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
            }
            AfinadorTheme(dark = dark) {
                AppRoot(viewModel)
            }
        }
    }
}
