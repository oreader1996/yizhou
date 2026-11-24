#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowMode {
    Collapsed,
    Expanded,
    Pinned,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn edge_rect(area: Rect, scale: f64, mode: WindowMode) -> Rect {
    let px = |logical: f64| (logical * scale).round() as u32;
    let inset = px(12.0);
    let horizontal = inset.min(area.width.saturating_sub(1) / 2);
    let vertical = inset.min(area.height.saturating_sub(1) / 2);
    let max_width = area.width.saturating_sub(horizontal * 2).max(1);
    let max_height = area.height.saturating_sub(vertical * 2).max(1);
    let (width, height, top) = if mode == WindowMode::Collapsed {
        let height = px(48.0).min(max_height);
        (px(48.0).min(max_width), height, area.height.saturating_sub(height) / 2)
    } else {
        (px(380.0).min(max_width), max_height, vertical)
    };
    Rect {
        x: area.x + area.width.saturating_sub(width + horizontal) as i32,
        y: area.y + top as i32,
        width,
        height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn positions_on_scaled_left_monitor() {
        let area = Rect { x: -1920, y: 0, width: 1920, height: 1040 };
        assert_eq!(edge_rect(area, 1.5, WindowMode::Collapsed), Rect { x: -90, y: 484, width: 72, height: 72 });
        assert_eq!(edge_rect(area, 1.5, WindowMode::Expanded), Rect { x: -588, y: 18, width: 570, height: 1004 });
    }
}
