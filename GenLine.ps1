$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding

$msg = @"
ติดต่อฉันได้ที่:

LINE : artap5321
https://line.me/ti/p/gqIluRmdJ_

✅จ้างงานฉันแบบง่าย ๆ ผ่านทางนี้:
https://artnp.github.io/eworker
"@

Set-Clipboard -Value $msg

# We use WPF for a beautiful UI
Add-Type -AssemblyName PresentationFramework

[xml]$XAML = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        เข้าลิ้งค์นี้ๆx/2006/xaml"
        Title="Contact Info" Height="300" Width="480" 
        WindowStartupLocation="CenterScreen" WindowStyle="None" 
        AllowsTransparency="True" Background="Transparent" Topmost="True">
    <Window.Resources>
        <!-- Custom button style for close button -->
        <Style TargetType="Button" x:Key="CloseBtnStyle">
            <Setter Property="Background" Value="Transparent"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Foreground" Value="#ffffff"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" CornerRadius="12">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
            <Style.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                    <Setter Property="Background" Value="#cc009c00"/>
                    <Setter Property="Foreground" Value="#ffffff"/>
                </Trigger>
            </Style.Triggers>
        </Style>
    </Window.Resources>
    
    <Grid>
        <!-- Shadow effect -->
        <Border Margin="10" CornerRadius="15" Background="White">
            <Border.Effect>
                <DropShadowEffect BlurRadius="15" ShadowDepth="4" Opacity="0.2" Color="Black"/>
            </Border.Effect>
        </Border>
        
        <Border Margin="10" CornerRadius="15" BorderBrush="#00C300" BorderThickness="2" ClipToBounds="True">
            <Border.Background>
                <LinearGradientBrush StartPoint="0,0" EndPoint="1,1">
                    <GradientStop Color="#ffffff" Offset="0"/>
                    <GradientStop Color="#f2fff2" Offset="1"/>
                </LinearGradientBrush>
            </Border.Background>
            <Grid Margin="0">
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="*"/>
                    <RowDefinition Height="Auto"/>
                </Grid.RowDefinitions>
                
                <!-- Header with LINE green color -->
                <Border Background="#00C300" Grid.Row="0" Padding="20,12">
                    <Grid>
                        <StackPanel Orientation="Horizontal">
                            <TextBlock Text="💬" FontSize="20" Margin="0,0,10,0" VerticalAlignment="Center"/>
                            <TextBlock Text="คัดลอกข้อมูลติดต่อแล้ว!" FontSize="18" FontWeight="Bold" Foreground="White" VerticalAlignment="Center"/>
                        </StackPanel>
                        <Button Name="btnClose" HorizontalAlignment="Right" VerticalAlignment="Center" Width="24" Height="24" FontSize="14" FontWeight="Bold" Content="✕" Style="{StaticResource CloseBtnStyle}"/>
                    </Grid>
                </Border>
                
                <!-- Content -->
                <StackPanel Grid.Row="1" Margin="25,20,25,10">
                    <TextBlock FontSize="14" Foreground="#333333" TextWrapping="Wrap" TextAlignment="Center">
                        <Run Text="✅ คุณสามารถกด Ctrl+V เพื่อวางข้อความให้ลูกค้าได้เลย" FontWeight="SemiBold" Foreground="#00aa00"/>
                    </TextBlock>
                    
                    <Border Background="#f9f9f9" CornerRadius="8" Padding="15" Margin="0,15,0,0" BorderBrush="#eeeeee" BorderThickness="1">
                        <TextBlock FontSize="13" Foreground="#555555" TextWrapping="Wrap" LineHeight="20">
                            <Run Text="LINE : artap5321" FontWeight="Bold" Foreground="#333333"/>
                            <LineBreak/>
                            <Run Text="https://line.me/ti/p/gqIluRmdJ_" Foreground="#005a9e"/>
                            <LineBreak/>
                            <LineBreak/>
                            <Run Text="จ้างงานฉันแบบง่าย ๆ ผ่านทางนี้ :" FontWeight="Bold" Foreground="#333333"/>
                            <LineBreak/>
                            <Run Text="https://artnp.github.io/eworker" Foreground="#005a9e"/>
                        </TextBlock>
                    </Border>
                </StackPanel>
                
                <!-- Footer with Timer -->
                <Grid Grid.Row="2" Margin="25,0,25,20">
                    <Grid.RowDefinitions>
                        <RowDefinition Height="Auto"/>
                        <RowDefinition Height="Auto"/>
                    </Grid.RowDefinitions>
                    
                    <TextBlock Name="lblTimer" Grid.Row="0" FontSize="13" FontWeight="Bold" Foreground="#d13438" Margin="0,0,0,8" Text="ข้อความจะถูกทำลายอัตโนมัติใน: 15 วินาที" HorizontalAlignment="Center"/>
                    
                    <ProgressBar Name="pbTimer" Grid.Row="1" Height="6" Minimum="0" Maximum="150" Value="150" BorderThickness="0">
                        <ProgressBar.Resources>
                            <Style TargetType="ProgressBar">
                                <Setter Property="Template">
                                    <Setter.Value>
                                        <ControlTemplate TargetType="ProgressBar">
                                            <Grid>
                                                <Border Background="#ffe6e6" CornerRadius="3"/>
                                                <Border Name="PART_Track"/>
                                                <Border Name="PART_Indicator" Background="#d13438" CornerRadius="3" HorizontalAlignment="Left"/>
                                            </Grid>
                                        </ControlTemplate>
                                    </Setter.Value>
                                </Setter>
                            </Style>
                        </ProgressBar.Resources>
                    </ProgressBar>
                </Grid>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$Window = [System.Windows.Markup.XamlReader]::Load($reader)

$lblTimer = $Window.FindName("lblTimer")
$pbTimer = $Window.FindName("pbTimer")
$btnClose = $Window.FindName("btnClose")

$btnClose.Add_Click({
        $Window.Close()
    })

$timeLeft = 15.0
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(100)
$timer.Add_Tick({
        $script:timeLeft -= 0.1
        if ($script:timeLeft -le 0) {
            $timer.Stop()
            Set-Clipboard -Value "" # Clear clipboard to destroy message
            $Window.Close()
        }
        else {
            $lblTimer.Text = "ข้อความในคลิปบอร์ดจะถูกทำลายอัตโนมัติใน: $([math]::Ceiling($script:timeLeft)) วินาที"
            $pbTimer.Value = [math]::Max(0, [int]($script:timeLeft * 10))
        }
    })

$Window.Add_Loaded({
        $timer.Start()
    })

# Add drag ability
$Window.Add_MouseLeftButtonDown({
        $Window.DragMove()
    })

$Window.ShowDialog() | Out-Null
