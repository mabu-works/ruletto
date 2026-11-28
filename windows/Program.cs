using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace Ruletto
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
        }
    }

    internal sealed class MainForm : Form
    {
        // ==========================================================
        // 🎨 Web 版と共通の仕様値（パレット・上限・プリセット）
        // ==========================================================
        private static readonly string[] PaletteHex =
        {
            "#f03e3e", "#f76707", "#f59f00", "#37b24d", "#0ca678",
            "#1098ad", "#1c7ed6", "#7048e8", "#a61e4d", "#e67700",
            "#2f9e44", "#1971c2"
        };
        private const int MaxItems = 50;
        private const int MaxHistory = 20;
        private const int MaxItemLength = 30;
        private const int SpinDurationMs = 4200;

        private static readonly Dictionary<string, string[]> Presets = new Dictionary<string, string[]>
        {
            { "夕食", new[] { "カレー", "ラーメン", "寿司", "焼肉", "パスタ", "唐揚げ", "鍋", "ハンバーグ" } },
            { "罰ゲーム", new[] { "一発芸", "モノマネ", "腕立て10回", "変顔で写真", "歌を一曲", "早口言葉", "ジュースおごり", "もう一回回す" } },
            { "係決め", new[] { "司会", "買い出し", "片付け", "写真係", "盛り上げ役", "記録係" } }
        };

        // 🌑 ダークテーマの色（Web 版の変数と対応）
        private static readonly Color BgColor = Color.FromArgb(10, 15, 28);
        private static readonly Color SurfaceColor = Color.FromArgb(17, 26, 44);
        private static readonly Color Surface2Color = Color.FromArgb(24, 38, 66);
        private static readonly Color ForeColorMain = Color.FromArgb(236, 241, 248);
        private static readonly Color MutedColor = Color.FromArgb(157, 177, 199);
        private static readonly Color AccentColor = Color.FromArgb(106, 141, 255);
        private static readonly Color WinnerColor = Color.FromArgb(142, 240, 221);

        // ==========================================================
        // 🧩 コントロールと状態
        // ==========================================================
        private readonly TextBox itemsBox;
        private readonly Label countLabel;
        private readonly Panel wheelPanel;
        private readonly Label resultLabel;
        private readonly Button spinButton;
        private readonly Button copyButton;
        private readonly ListBox historyList;
        private readonly Timer spinTimer;
        private readonly Stopwatch spinWatch = new Stopwatch();
        private readonly Random random = new Random();

        private List<string> items = new List<string> { "A", "B", "C", "D" };
        private double rotation; // 現在の回転角（ラジアン）
        private bool spinning;
        private double spinStartRotation;
        private double spinTargetRotation;
        private string? lastResult;

        public MainForm()
        {
            Text = "ルレット for Windows｜ルーレット";
            ClientSize = new Size(1020, 660);
            MinimumSize = new Size(1036, 699);
            BackColor = BgColor;
            ForeColor = ForeColorMain;
            Font = new Font("Yu Gothic UI", 10F);

            var titleLabel = new Label
            {
                Text = "ルレット｜汎用ルーレットメーカー",
                Font = new Font("Yu Gothic UI", 15F, FontStyle.Bold),
                ForeColor = ForeColorMain,
                Location = new Point(16, 12),
                AutoSize = true
            };
            Controls.Add(titleLabel);

            // ✏️ 項目入力（1 行 1 項目）
            var itemsLabel = new Label
            {
                Text = "項目（1行に1つ・最大50件）",
                ForeColor = MutedColor,
                Location = new Point(16, 56),
                AutoSize = true
            };
            Controls.Add(itemsLabel);

            itemsBox = new TextBox
            {
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                Text = string.Join(Environment.NewLine, items),
                Location = new Point(16, 82),
                Size = new Size(264, 330),
                BackColor = SurfaceColor,
                ForeColor = ForeColorMain,
                Font = new Font("Yu Gothic UI", 10F),
                BorderStyle = BorderStyle.FixedSingle
            };
            itemsBox.TextChanged += (sender, args) =>
            {
                ParseItems();
                wheelPanel.Invalidate();
            };
            Controls.Add(itemsBox);

            countLabel = new Label
            {
                Text = items.Count + " 件",
                ForeColor = MutedColor,
                Location = new Point(16, 418),
                AutoSize = true
            };
            Controls.Add(countLabel);

            // 🎁 プリセットボタン（縦に並べる）
            var presetLabel = new Label
            {
                Text = "プリセット",
                ForeColor = MutedColor,
                Location = new Point(16, 452),
                AutoSize = true
            };
            Controls.Add(presetLabel);

            int presetY = 480;
            foreach (string key in Presets.Keys)
            {
                string presetName = key;
                var presetButton = new Button
                {
                    Text = presetName,
                    BackColor = Surface2Color,
                    ForeColor = ForeColorMain,
                    FlatStyle = FlatStyle.Flat,
                    Location = new Point(16, presetY),
                    Size = new Size(264, 34)
                };
                presetButton.Click += (sender, args) =>
                {
                    itemsBox.Text = string.Join(Environment.NewLine, Presets[presetName]);
                    resultLabel.Text = "プリセットをセットしました。「回す」を押してね";
                };
                Controls.Add(presetButton);
                presetY += 42;
            }

            // 🎡 ホイール表示パネル（クリックでも回せる）
            wheelPanel = new Panel
            {
                Location = new Point(296, 52),
                Size = new Size(452, 452),
                BackColor = BgColor
            };
            EnableDoubleBuffering(wheelPanel);
            wheelPanel.Paint += DrawWheel;
            wheelPanel.Click += (sender, args) => Spin();
            Controls.Add(wheelPanel);

            resultLabel = new Label
            {
                Text = "項目を入れて「回す」を押してね",
                Font = new Font("Yu Gothic UI", 16F, FontStyle.Bold),
                ForeColor = WinnerColor,
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(296, 510),
                Size = new Size(452, 42)
            };
            Controls.Add(resultLabel);

            spinButton = new Button
            {
                Text = "回す",
                Font = new Font("Yu Gothic UI", 12F, FontStyle.Bold),
                BackColor = AccentColor,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(296, 562),
                Size = new Size(220, 44)
            };
            spinButton.FlatAppearance.BorderSize = 0;
            spinButton.Click += (sender, args) => Spin();
            Controls.Add(spinButton);

            copyButton = new Button
            {
                Text = "結果をコピー",
                BackColor = Surface2Color,
                ForeColor = ForeColorMain,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(528, 562),
                Size = new Size(220, 44),
                Enabled = false
            };
            copyButton.Click += (sender, args) =>
            {
                if (lastResult == null) return;
                Clipboard.SetText("ルーレットの結果：" + lastResult);
                resultLabel.Text = "🎉 " + lastResult + "（コピーしました）";
            };
            Controls.Add(copyButton);

            // 📜 履歴
            var historyLabel = new Label
            {
                Text = "履歴",
                ForeColor = MutedColor,
                Location = new Point(764, 56),
                AutoSize = true
            };
            Controls.Add(historyLabel);

            historyList = new ListBox
            {
                Location = new Point(764, 82),
                Size = new Size(240, 422),
                BackColor = SurfaceColor,
                ForeColor = ForeColorMain,
                BorderStyle = BorderStyle.FixedSingle
            };
            Controls.Add(historyList);

            var noteLabel = new Label
            {
                Text = "項目を編集するとホイールへ即時反映されます。ホイールをクリックしても回せます。",
                ForeColor = MutedColor,
                Location = new Point(16, 624),
                AutoSize = true
            };
            Controls.Add(noteLabel);

            spinTimer = new Timer { Interval = 16 };
            spinTimer.Tick += SpinTick;
        }

        // 🖼️ パネルのダブルバッファを有効にして描画のちらつきを抑える
        private static void EnableDoubleBuffering(Control control)
        {
            typeof(Panel).GetProperty("DoubleBuffered",
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                ?.SetValue(control, true);
        }

        // ✏️ テキストボックスの内容を項目リストへ解釈し直す
        private void ParseItems()
        {
            var parsed = new List<string>();
            foreach (string line in itemsBox.Text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None))
            {
                string value = line.Trim();
                if (value.Length == 0) continue;
                if (value.Length > MaxItemLength) value = value.Substring(0, MaxItemLength);
                parsed.Add(value);
                if (parsed.Count >= MaxItems) break;
            }
            items = parsed;
            countLabel.Text = items.Count + " 件";
        }

        // ==========================================================
        // 🎨 ホイール描画（Web 版 drawWheel と同じ幾何）
        // ==========================================================
        private void DrawWheel(object? sender, PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

            float cx = wheelPanel.Width / 2f;
            float cy = wheelPanel.Height / 2f;
            float radius = Math.Min(wheelPanel.Width, wheelPanel.Height) / 2f - 14;
            int count = items.Count;

            if (count == 0)
            {
                using (var gray = new SolidBrush(Color.FromArgb(204, 204, 204)))
                {
                    g.FillEllipse(gray, cx - radius, cy - radius, radius * 2, radius * 2);
                }
                return;
            }

            double seg = Math.PI * 2 / count;
            float segDeg = (float)(seg * 180 / Math.PI);
            float rotDeg = (float)(rotation * 180 / Math.PI);
            var bounds = new RectangleF(cx - radius, cy - radius, radius * 2, radius * 2);

            for (int i = 0; i < count; i++)
            {
                float startDeg = -90f + rotDeg + segDeg * i;
                Color segmentColor = ColorTranslator.FromHtml(PaletteHex[i % PaletteHex.Length]);
                using (var brush = new SolidBrush(segmentColor))
                {
                    g.FillPie(brush, bounds, startDeg, segDeg);
                }
                using (var pen = new Pen(Color.FromArgb(217, 255, 255, 255), 2))
                {
                    g.DrawPie(pen, bounds, startDeg, segDeg);
                }

                // 🏷️ ラベルは区画の中央方向へ回して半径方向に沿わせる
                double mid = -Math.PI / 2 + rotation + seg * i + seg / 2;
                GraphicsState state = g.Save();
                g.TranslateTransform(cx, cy);
                g.RotateTransform((float)(mid * 180 / Math.PI));
                int fontSize = LabelFontSize(count, radius);
                using (var font = new Font("Yu Gothic UI", fontSize, FontStyle.Bold))
                {
                    var format = new StringFormat
                    {
                        Alignment = StringAlignment.Far,
                        LineAlignment = StringAlignment.Center
                    };
                    var textRect = new RectangleF(0, -fontSize, radius - 12, fontSize * 2);
                    g.DrawString(TruncateLabel(items[i], count), font, Brushes.White, textRect, format);
                }
                g.Restore(state);
            }

            // ⭕ 中心円と「回す」の文字
            float centerRadius = radius * 0.16f;
            var centerRect = new RectangleF(cx - centerRadius, cy - centerRadius, centerRadius * 2, centerRadius * 2);
            using (var brush = new SolidBrush(Color.White))
            {
                g.FillEllipse(brush, centerRect);
            }
            using (var pen = new Pen(Color.FromArgb(38, 0, 0, 0), 1))
            {
                g.DrawEllipse(pen, centerRect);
            }
            using (var font = new Font("Yu Gothic UI", Math.Max(9, radius * 0.11f), FontStyle.Bold))
            using (var brush = new SolidBrush(Color.FromArgb(232, 89, 12)))
            {
                var format = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };
                g.DrawString("回す", font, brush, centerRect, format);
            }

            // 🔻 真上のポインタ
            var pointer = new[]
            {
                new PointF(cx - 16, 2),
                new PointF(cx + 16, 2),
                new PointF(cx, 30)
            };
            using (var brush = new SolidBrush(Color.FromArgb(33, 37, 41)))
            {
                g.FillPolygon(brush, pointer);
            }
        }

        // 📏 ラベルの省略文字数（Web 版と同じ段階）
        private static int LabelMaxChars(int count)
        {
            if (count <= 8) return 10;
            if (count <= 16) return 9;
            if (count <= 24) return 8;
            if (count <= 36) return 7;
            return 6;
        }

        // 📏 ラベルのフォントサイズ（基準半径 306 で換算、最小 9）
        private static int LabelFontSize(int count, float radius)
        {
            int baseSize;
            if (count <= 8) baseSize = 24;
            else if (count <= 16) baseSize = 20;
            else if (count <= 24) baseSize = 17;
            else if (count <= 36) baseSize = 14;
            else baseSize = 12;
            return Math.Max(9, (int)Math.Round(baseSize * (radius / 306.0)));
        }

        private static string TruncateLabel(string text, int count)
        {
            int max = LabelMaxChars(count);
            return text.Length > max ? text.Substring(0, max) + "…" : text;
        }

        // 🔍 真上のポインタが指す項目の index（Web 版 winnerIndex と同じ計算）
        private int WinnerIndex()
        {
            int count = items.Count;
            if (count == 0) return -1;
            double seg = Math.PI * 2 / count;
            double local = ((-rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
            return (int)Math.Floor(local / seg) % count;
        }

        // ==========================================================
        // 🔄 回転アニメーション（Web 版と同じ 4200ms・easeOutQuart）
        // ==========================================================
        private void Spin()
        {
            if (spinning) return;
            if (items.Count < 2)
            {
                resultLabel.Text = "項目を2つ以上入れてください";
                return;
            }
            spinning = true;
            spinButton.Enabled = false;
            copyButton.Enabled = false;
            resultLabel.Text = "回転中…";

            spinStartRotation = rotation;
            double extra = Math.PI * 2 * (5 + random.NextDouble() * 3) + random.NextDouble() * Math.PI * 2;
            spinTargetRotation = spinStartRotation + extra;
            spinWatch.Restart();
            spinTimer.Start();
        }

        private void SpinTick(object? sender, EventArgs e)
        {
            double t = Math.Min(1.0, spinWatch.ElapsedMilliseconds / (double)SpinDurationMs);
            double eased = 1 - Math.Pow(1 - t, 4); // easeOutQuart
            rotation = spinStartRotation + (spinTargetRotation - spinStartRotation) * eased;
            wheelPanel.Invalidate();
            if (t >= 1.0)
            {
                spinTimer.Stop();
                spinWatch.Stop();
                rotation = spinTargetRotation % (Math.PI * 2);
                wheelPanel.Invalidate();
                spinning = false;
                spinButton.Enabled = true;
                FinishSpin();
            }
        }

        private void FinishSpin()
        {
            int index = WinnerIndex();
            if (index < 0) return;
            lastResult = items[index];
            resultLabel.Text = "🎉 " + lastResult;
            copyButton.Enabled = true;
            historyList.Items.Insert(0, lastResult + "　" + DateTime.Now.ToString("HH:mm:ss"));
            while (historyList.Items.Count > MaxHistory)
            {
                historyList.Items.RemoveAt(historyList.Items.Count - 1);
            }
        }
    }
}
