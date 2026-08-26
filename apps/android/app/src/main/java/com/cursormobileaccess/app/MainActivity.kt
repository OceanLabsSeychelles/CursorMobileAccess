package com.cursormobileaccess.app

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import com.cursormobileaccess.app.ui.CmaApp
import com.cursormobileaccess.app.ui.theme.CmaTheme

class MainActivity : ComponentActivity() {
    private val notifyPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* granted or not — banners still work in-app */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 33) {
            notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            CmaTheme {
                CmaApp()
            }
        }
    }
}
